const { getSheetRows } = require('./sheets.service');
const { parseAmount, formatMoney } = require('../utils/money.util');
const { isToday, isCurrentMonth } = require('../utils/date.util');

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

async function getTodaySummary(userId) {
  return getSummary(userId, 'today');
}

async function getMonthlySummary(userId) {
  return getSummary(userId, 'month');
}

async function getSummary(userId, mode) {
  const rows = await getSheetRows(TRANSACTION_SHEET_NAME, 'A:K');

  let total = 0;
  let count = 0;
  const byCategory = {};
  const byShop = {};

  rows.slice(1).forEach((row) => {
    const rowUserId = row[2];
    const shopName = row[4] || '-';
    const amountText = row[5] || '0';
    const transactionDate = row[6] || '';
    const category = row[8] || 'Other';

    if (userId && rowUserId !== userId) return;

    if (mode === 'today' && !isToday(transactionDate)) return;
    if (mode === 'month' && !isCurrentMonth(transactionDate)) return;

    const amount = parseAmount(amountText);

    total += amount;
    count++;

    byCategory[category] = (byCategory[category] || 0) + amount;
    byShop[shopName] = (byShop[shopName] || 0) + amount;
  });

  if (count === 0) {
    return mode === 'today'
      ? 'วันนี้ยังไม่มีรายการบันทึกครับ'
      : 'เดือนนี้ยังไม่มีรายการบันทึกครับ';
  }

  return buildSummaryMessage(
    mode === 'today' ? 'สรุปรายการวันนี้' : 'สรุปรายการเดือนนี้',
    count,
    total,
    byCategory,
    byShop
  );
}

function buildSummaryMessage(title, count, total, byCategory, byShop) {
  const categoryText = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => `- ${category}: ${formatMoney(amount)} บาท`)
    .join('\n');

  const shopText = Object.entries(byShop)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([shop, amount], index) => `${index + 1}. ${shop}: ${formatMoney(amount)} บาท`)
    .join('\n');

  return `${title}

จำนวนรายการ: ${count}
ยอดรวม: ${formatMoney(total)} บาท

แยกตามหมวดหมู่:
${categoryText || '-'}

Top ร้านค้า/ธนาคาร:
${shopText || '-'}`;
}

module.exports = {
  getTodaySummary,
  getMonthlySummary
};
