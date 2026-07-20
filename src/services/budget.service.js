const crypto = require('crypto');
const { getSheetRows, appendRows, updateRows } = require('./sheets.service');
const { parseAmount, formatMoney } = require('../utils/money.util');
const { normalizeText } = require('../utils/text.util');
const {
  getCurrentPlanMonthKey,
  getPreviousPlanMonthKey
} = require('../utils/date.util');

const BUDGET_SHEET_NAME = 'BudgetPlan';
const BUDGET_PAYMENT_SHEET_NAME = process.env.BUDGET_PAYMENT_SHEET_NAME || 'BudgetPayments';

async function getBudgetRows() {
  return getSheetRows(BUDGET_SHEET_NAME, 'A:I');
}

async function getBudgetPaymentRows() {
  return getSheetRows(BUDGET_PAYMENT_SHEET_NAME, 'A:J');
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

  const month = getCurrentPlanMonthKey();
  const now = new Date().toISOString();

  await appendRows(BUDGET_SHEET_NAME, 'A:J', [[
    month,
    userId,
    '',
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
  const month = getCurrentPlanMonthKey();

  const plans = rows.slice(1).filter(row =>
    row[0] === month &&
    row[1] === userId &&
    row[7] !== 'Inactive'
  );

  if (plans.length === 0) {
    return 'เดือนนี้ยังไม่มีแผนครับ\nตัวอย่าง: เพิ่มแผน UOB 24677';
  }

  let totalPlan = 0;
  let totalPaid = 0;
  let totalRemaining = 0;

  const planText = plans.map((row, index) => {
    const planName = row[3] || '-';
    const planAmount = parseAmount(row[4]);
    const paidAmount = parseAmount(row[5]);
    const remaining = parseAmount(row[6]);

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
  const month = getCurrentPlanMonthKey();

  const plans = rows.slice(1).filter(row =>
    row[0] === month &&
    row[1] === userId &&
    row[7] !== 'Inactive'
  );

  if (plans.length === 0) {
    return 'ยังไม่มีแผนสำหรับเดือนนี้ครับ';
  }

  let totalRemaining = 0;

  const text = plans.map((row, index) => {
    const planName = row[3] || '-';
    const remaining = parseAmount(row[6]);

    totalRemaining += remaining;

    return `${index + 1}. ${planName}: ${formatMoney(remaining)} บาท`;
  }).join('\n');

  return `คงเหลือเดือนนี้

${text}

คงเหลือรวม: ${formatMoney(totalRemaining)} บาท`;
}

async function copyPreviousMonthPlans(userId) {
  const rows = await getBudgetRows();

  const currentMonth = getCurrentPlanMonthKey();
  const previousMonth = getPreviousPlanMonthKey();

  const currentPlans = rows.slice(1).filter(row =>
    row[0] === currentMonth &&
    row[1] === userId &&
    row[7] !== 'Inactive'
  );

  if (currentPlans.length > 0) {
    return `เดือนนี้มีแผนอยู่แล้วครับ (${currentPlans.length} รายการ)`;
  }

  const previousPlans = rows.slice(1).filter(row =>
    row[0] === previousMonth &&
    row[1] === userId &&
    row[7] !== 'Inactive'
  );

  if (previousPlans.length === 0) {
    return `ไม่พบแผนของเดือนก่อน (${previousMonth}) ครับ`;
  }

  const now = new Date().toISOString();

  const values = previousPlans.map(row => {
    const category = row[2] || '';
    const planName = row[3] || '';
    const planAmount = parseAmount(row[4]);

    return [
      currentMonth,
      userId,
      category,
      planName,
      planAmount,
      0,
      planAmount,
      'Active',
      now,
      now
    ];
  });

  await appendRows(BUDGET_SHEET_NAME, 'A:J', values);

  return `copy แผนเดือนก่อนเรียบร้อยครับ

จากเดือน: ${previousMonth}
มาเป็นเดือน: ${currentMonth}
จำนวน: ${values.length} รายการ`;
}

async function markPlanPaid(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 3) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: จ่ายแล้ว UOB 5000';
  }

  const planName = parts[1];
  const inputAmount = parseAmount(parts[2]);
  const note = parts.slice(3).join(' ');

  if (!inputAmount || inputAmount <= 0) {
    return 'กรุณาระบุยอดที่จ่ายให้ถูกต้องครับ\nตัวอย่าง: จ่ายแล้ว UOB 5000';
  }

  const month = getCurrentPlanMonthKey();
  const rows = await getBudgetRows();

  const plan = findPlan(rows, userId, month, planName);

  if (!plan) {
    return `ไม่พบแผน ${planName} ของเดือนนี้ครับ`;
  }

  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await appendRows(BUDGET_PAYMENT_SHEET_NAME, 'A:J', [[
    paymentId,
    month,
    userId,
    plan.row[3] || planName,
    inputAmount,
    now.slice(0, 10),
    note,
    'Active',
    now,
    now
  ]]);

  const paidAmount = await calculatePaidFromBudgetPayments(userId, month, plan.row[3] || planName);
  const { planAmount, remaining } = await updateBudgetPlanTotals(rows, plan, paidAmount);

  return `บันทึกการจ่ายเรียบร้อยครับ

PaymentId: ${paymentId}
แผน: ${plan.row[3] || planName}
เดือนแผน: ${month}
จ่ายครั้งนี้: ${formatMoney(inputAmount)} บาท
จ่ายแล้วรวม: ${formatMoney(paidAmount)} บาท
ยอดแผน: ${formatMoney(planAmount)} บาท
คงเหลือ: ${formatMoney(remaining)} บาท`;
}

async function getBudgetPaymentHistory(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: ประวัติจ่าย UOB';
  }

  const planName = parts[1];
  const month = getCurrentPlanMonthKey();
  const rows = await getBudgetPaymentRows();
  const payments = getActivePayments(rows, userId, month, planName);

  if (payments.length === 0) {
    return `ยังไม่มีประวัติจ่ายของแผน ${planName} ในเดือนแผน ${month} ครับ`;
  }

  const totalPaid = payments.reduce((sum, payment) => sum + parseAmount(payment[4]), 0);
  const paymentText = payments.map((payment, index) => {
    const paymentId = payment[0] || '-';
    const amount = parseAmount(payment[4]);
    const paymentDate = payment[5] || '-';
    const note = payment[6] ? ` (${payment[6]})` : '';

    return `${index + 1}. ${paymentDate}: ${formatMoney(amount)} บาท${note}\nID: ${paymentId}`;
  }).join('\n\n');

  return `ประวัติจ่าย ${planName}
เดือนแผน: ${month}

${paymentText}

จ่ายแล้วรวม: ${formatMoney(totalPaid)} บาท`;
}

async function deleteBudgetPayment(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: ลบจ่าย <PaymentId>';
  }

  const paymentIdInput = normalizeText(parts[1]);
  const paymentRows = await getBudgetPaymentRows();
  const paymentIndex = paymentRows.findIndex((row, index) =>
    index > 0 &&
    row[2] === userId &&
    !isDeletedPayment(row) &&
    normalizeText(row[0]).startsWith(paymentIdInput)
  );

  if (paymentIndex < 0) {
    return `ไม่พบรายการจ่าย ID ${parts[1]} ครับ`;
  }

  const payment = paymentRows[paymentIndex];
  const month = payment[1];
  const planName = payment[3];
  const now = new Date().toISOString();
  const paymentSheetRowNumber = paymentIndex + 1;

  await updateRows(BUDGET_PAYMENT_SHEET_NAME, `H${paymentSheetRowNumber}:J${paymentSheetRowNumber}`, [[
    'Deleted',
    payment[8] || now,
    now
  ]]);

  const budgetRows = await getBudgetRows();
  const plan = findPlan(budgetRows, userId, month, planName);

  if (plan) {
    const paidAmount = await calculatePaidFromBudgetPayments(userId, month, planName);
    await updateBudgetPlanTotals(budgetRows, plan, paidAmount);
  }

  return `ลบรายการจ่ายเรียบร้อยครับ

PaymentId: ${payment[0]}
แผน: ${planName}
เดือนแผน: ${month}
ยอดที่ลบ: ${formatMoney(parseAmount(payment[4]))} บาท`;
}

async function calculatePaidFromBudgetPayments(userId, month, planName) {
  const rows = await getBudgetPaymentRows();

  return getActivePayments(rows, userId, month, planName)
    .reduce((sum, row) => sum + parseAmount(row[4]), 0);
}

function getActivePayments(rows, userId, month, planName) {
  const keyword = normalizeText(planName);

  return rows.slice(1).filter(row =>
    row[1] === month &&
    row[2] === userId &&
    normalizeText(row[3]) === keyword &&
    !isDeletedPayment(row)
  );
}

function isDeletedPayment(row) {
  return normalizeText(row[7]) === 'deleted';
}

function findPlan(rows, userId, month, planName) {
  const rowIndex = rows.findIndex((row, index) =>
    index > 0 &&
    row[0] === month &&
    row[1] === userId &&
    normalizeText(row[3]) === normalizeText(planName) &&
    row[7] !== 'Inactive'
  );

  if (rowIndex < 0) return null;

  return {
    row: rows[rowIndex],
    rowIndex
  };
}

async function updateBudgetPlanTotals(rows, plan, paidAmount) {
  const row = plan.row;
  const planAmount = parseAmount(row[4]);
  const remaining = Math.max(planAmount - paidAmount, 0);
  const now = new Date().toISOString();
  const sheetRowNumber = plan.rowIndex + 1;

  await updateRows(BUDGET_SHEET_NAME, `F${sheetRowNumber}:J${sheetRowNumber}`, [[
    paidAmount,
    remaining,
    remaining <= 0 ? 'Paid' : 'Active',
    row[8] || now,
    now
  ]]);

  return {
    planAmount,
    remaining
  };
}

async function deleteBudgetPlan(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: ลบแผน UOB';
  }

  const planName = parts[1];
  const month = getCurrentPlanMonthKey();
  const budgetRows = await getBudgetRows();
  const plan = findPlan(budgetRows, userId, month, planName);

  if (!plan) {
    return `ไม่พบแผน ${planName} ของเดือนนี้ครับ`;
  }

  const now = new Date().toISOString();
  const sheetRowNumber = plan.rowIndex + 1;

  // Mark plan as Inactive
  await updateRows(BUDGET_SHEET_NAME, `H${sheetRowNumber}:J${sheetRowNumber}`, [[
    'Inactive',
    plan.row[8] || now,
    now
  ]]);

  // Find and mark associated payments as Deleted
  const paymentRows = await getBudgetPaymentRows();
  const keyword = normalizeText(planName);
  let deletedPaymentsCount = 0;

  for (let i = 1; i < paymentRows.length; i++) {
    const row = paymentRows[i];
    if (
      row[1] === month &&
      row[2] === userId &&
      normalizeText(row[3]) === keyword &&
      !isDeletedPayment(row)
    ) {
      const paymentSheetRowNumber = i + 1;
      await updateRows(BUDGET_PAYMENT_SHEET_NAME, `H${paymentSheetRowNumber}:J${paymentSheetRowNumber}`, [[
        'Deleted',
        row[8] || now,
        now
      ]]);
      deletedPaymentsCount++;
    }
  }

  let responseText = `ลบแผนเรียบร้อยครับ
  
เดือน: ${month}
แผน: ${planName}
ยอดแผนที่ลบ: ${formatMoney(parseAmount(plan.row[4]))} บาท`;

  if (deletedPaymentsCount > 0) {
    responseText += `\nและได้ยกเลิกประวัติการจ่ายเงินของแผนนี้จำนวน ${deletedPaymentsCount} รายการแล้วครับ`;
  }

  return responseText;
}

async function editBudgetPlan(userId, text) {
  const parts = text.trim().split(/\s+/);

  if (parts.length < 3) {
    return 'รูปแบบไม่ถูกต้องครับ\nตัวอย่าง: แก้ไขแผน UOB 30000';
  }

  const planName = parts[1];
  const newAmount = parseAmount(parts[2]);

  if (!planName || newAmount <= 0) {
    return 'กรุณาระบุชื่อแผนและยอดเงินใหม่ให้ถูกต้องครับ\nตัวอย่าง: แก้ไขแผน UOB 30000';
  }

  const month = getCurrentPlanMonthKey();
  const budgetRows = await getBudgetRows();
  const plan = findPlan(budgetRows, userId, month, planName);

  if (!plan) {
    return `ไม่พบแผน ${planName} ของเดือนนี้ครับ`;
  }

  const oldAmount = parseAmount(plan.row[4]);
  const paidAmount = parseAmount(plan.row[5]);
  const remaining = Math.max(newAmount - paidAmount, 0);
  const now = new Date().toISOString();
  const sheetRowNumber = plan.rowIndex + 1;

  await updateRows(BUDGET_SHEET_NAME, `E${sheetRowNumber}:J${sheetRowNumber}`, [[
    newAmount,
    paidAmount,
    remaining,
    remaining <= 0 ? 'Paid' : 'Active',
    plan.row[8] || now,
    now
  ]]);

  return `แก้ไขแผนเรียบร้อยครับ

เดือน: ${month}
แผน: ${plan.row[3] || planName}
ยอดเดิม: ${formatMoney(oldAmount)} บาท
ยอดใหม่: ${formatMoney(newAmount)} บาท
จ่ายแล้ว: ${formatMoney(paidAmount)} บาท
คงเหลือใหม่: ${formatMoney(remaining)} บาท`;
}

module.exports = {
  addBudgetPlan,
  getCurrentMonthPlans,
  getRemainingPlans,
  copyPreviousMonthPlans,
  markPlanPaid,
  getBudgetPaymentHistory,
  deleteBudgetPayment,
  deleteBudgetPlan,
  editBudgetPlan
};
