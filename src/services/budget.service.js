const { getSheetRows, appendRows, updateRows } = require('./sheets.service');
const { parseAmount, formatMoney } = require('../utils/money.util');
const { normalizeText } = require('../utils/text.util');
const { getCurrentMonthKey, getPreviousMonthKey, isCurrentMonth } = require('../utils/date.util');

const BUDGET_SHEET_NAME = 'BudgetPlan';
const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

async function getBudgetRows() {
  return getSheetRows(BUDGET_SHEET_NAME, 'A:I');
}

async function addBudgetPlan(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 3) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: เพิ่มแผน UOB 24677';
  }

  const planName = parts[1];
  const planAmount = parseAmount(parts[2]);

  if (!planName || planAmount <= 0) {
    return 'กรุณาระบุชื่อแผนและยอดเงินให้ถูกต้องครับ\nตัวอย่าง: เพิ่มแผน UOB 24677';
  }

  const month = getCurrentMonthKey();
  const now = new Date().toISOString();

  await appendRows(BUDGET_SHEET_NAME, 'A:I', [[
    month,
    userId,
    planName,
    planAmount,
    0,
    planAmount,
    'Active',
    now,
    now
  ]]);

  return `เพิ่มแผนเรียบร้อยครับ

เดือน: ${month}
แผน: ${planName}
ยอดแผน: ${formatMoney(planAmount)} บาท`;
}

async function getCurrentMonthPlans(userId) {
  const rows = await getBudgetRows();
  const month = getCurrentMonthKey();

  const plans = rows.slice(1).filter(row =>
    row[0] === month &&
    row[1] === userId &&
    row[6] !== 'Inactive'
  );

  if (plans.length === 0) {
    return 'เดือนนี้ยังไม่มีแผนครับ\nตัวอย่าง: เพิ่มแผน UOB 24677';
  }

  let totalPlan = 0;
  let totalPaid = 0;
  let totalRemaining = 0;

  const planText = plans.map((row, index) => {
    const planName = row[2] || '-';
    const planAmount = parseAmount(row[3]);
    const paidAmount = parseAmount(row[4]);
    const remaining = parseAmount(row[5]);

    totalPlan += planAmount;
    totalPaid += paidAmount;
    totalRemaining += remaining;

    return `${index + 1}. ${planName}
แผน: ${formatMoney(planAmount)} บาท
จ่ายแล้ว: ${formatMoney(paidAmount)} บาท
คงเหลือ: ${formatMoney(remaining)} บาท`;
  }).join('\n\n');

  return `แผนเดือนนี้ ${month}

${planText}

รวมแผน: ${formatMoney(totalPlan)} บาท
รวมจ่ายแล้ว: ${formatMoney(totalPaid)} บาท
คงเหลือรวม: ${formatMoney(totalRemaining)} บาท`;
}

async function getRemainingPlans(userId) {
  const rows = await getBudgetRows();
  const month = getCurrentMonthKey();

  const plans = rows.slice(1).filter(row =>
    row[0] === month &&
    row[1] === userId &&
    row[6] !== 'Inactive'
  );

  if (plans.length === 0) {
    return 'ยังไม่มีแผนสำหรับเดือนนี้ครับ';
  }

  let totalRemaining = 0;

  const text = plans.map((row, index) => {
    const planName = row[2] || '-';
    const remaining = parseAmount(row[5]);

    totalRemaining += remaining;

    return `${index + 1}. ${planName}: ${formatMoney(remaining)} บาท`;
  }).join('\n');

  return `คงเหลือเดือนนี้

${text}

คงเหลือรวม: ${formatMoney(totalRemaining)} บาท`;
}

async function copyPreviousMonthPlans(userId) {
  const rows = await getBudgetRows();

  const currentMonth = getCurrentMonthKey();
  const previousMonth = getPreviousMonthKey();

  const currentPlans = rows.slice(1).filter(row =>
    row[0] === currentMonth &&
    row[1] === userId &&
    row[6] !== 'Inactive'
  );

  if (currentPlans.length > 0) {
    return `เดือนนี้มีแผนอยู่แล้วครับ (${currentPlans.length} รายการ)`;
  }

  const previousPlans = rows.slice(1).filter(row =>
    row[0] === previousMonth &&
    row[1] === userId &&
    row[6] !== 'Inactive'
  );

  if (previousPlans.length === 0) {
    return `ไม่พบแผนของเดือนก่อน (${previousMonth}) ครับ`;
  }

  const now = new Date().toISOString();

  const values = previousPlans.map(row => {
    const planName = row[2] || '';
    const planAmount = parseAmount(row[3]);

    return [
      currentMonth,
      userId,
      planName,
      planAmount,
      0,
      planAmount,
      'Active',
      now,
      now
    ];
  });

  await appendRows(BUDGET_SHEET_NAME, 'A:I', values);

  return `copy แผนเดือนก่อนเรียบร้อยครับ

จากเดือน: ${previousMonth}
มาเป็นเดือน: ${currentMonth}
จำนวน: ${values.length} รายการ`;
}

async function markPlanPaid(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: จ่ายแล้ว UOB 5000';
  }

  const planName = parts[1];
  const inputAmount = parts.length >= 3 ? parseAmount(parts[2]) : null;

  const month = getCurrentMonthKey();
  const rows = await getBudgetRows();

  const rowIndex = rows.findIndex((row, index) =>
    index > 0 &&
    row[0] === month &&
    row[1] === userId &&
    normalizeText(row[2]) === normalizeText(planName) &&
    row[6] !== 'Inactive'
  );

  if (rowIndex < 0) {
    return `ไม่พบแผน ${planName} ของเดือนนี้ครับ`;
  }

  const row = rows[rowIndex];
  const planAmount = parseAmount(row[3]);

  let paidAmount = inputAmount;

  if (!paidAmount || paidAmount <= 0) {
    paidAmount = await calculatePaidFromTransactions(userId, planName);
  }

  const remaining = Math.max(planAmount - paidAmount, 0);
  const now = new Date().toISOString();
  const sheetRowNumber = rowIndex + 1;

  await updateRows(BUDGET_SHEET_NAME, `E${sheetRowNumber}:I${sheetRowNumber}`, [[
    paidAmount,
    remaining,
    'Active',
    row[7] || now,
    now
  ]]);

  return `อัปเดตจ่ายแล้วเรียบร้อยครับ

แผน: ${planName}
ยอดแผน: ${formatMoney(planAmount)} บาท
จ่ายแล้ว: ${formatMoney(paidAmount)} บาท
คงเหลือ: ${formatMoney(remaining)} บาท`;
}

async function calculatePaidFromTransactions(userId, planName) {
  const rows = await getSheetRows(TRANSACTION_SHEET_NAME, 'A:K');

  let total = 0;

  rows.slice(1).forEach((row) => {
    const rowUserId = row[2];
    const shopName = row[4] || '';
    const amountText = row[5] || '0';
    const transactionDate = row[6] || '';
    const description = row[9] || '';
    const rawText = row[10] || '';

    if (userId && rowUserId !== userId) return;
    if (!isCurrentMonth(transactionDate)) return;

    const keyword = normalizeText(planName);
    const combinedText = normalizeText(`${shopName} ${description} ${rawText}`);

    if (!combinedText.includes(keyword)) return;

    total += parseAmount(amountText);
  });

  return total;
}

module.exports = {
  addBudgetPlan,
  getCurrentMonthPlans,
  getRemainingPlans,
  copyPreviousMonthPlans,
  markPlanPaid
};
