function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonthKey() {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isToday(dateText) {
  const parsedDate = parseTransactionDate(dateText);
  if (!parsedDate) return false;

  const today = new Date();

  return (
    parsedDate.getFullYear() === today.getFullYear() &&
    parsedDate.getMonth() === today.getMonth() &&
    parsedDate.getDate() === today.getDate()
  );
}

function isCurrentMonth(dateText) {
  const parsedDate = parseTransactionDate(dateText);
  if (!parsedDate) return false;

  const today = new Date();

  return (
    parsedDate.getFullYear() === today.getFullYear() &&
    parsedDate.getMonth() === today.getMonth()
  );
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  let match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return buildDate(match[1], match[2], match[3]);

  match = text.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if (match) {
    const month = getThaiMonthNumber(match[2]);
    if (month) return buildDate(match[1], month, match[3]);
  }

  match = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) return buildDate(match[3], match[2], match[1]);

  return null;
}

function buildDate(day, month, year) {
  let y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (y > 2400) y -= 543;

  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function getThaiMonthNumber(monthText) {
  const key = String(monthText).replace(/\s/g, '');

  const months = {
    'ม.ค.': 1, 'มค': 1, 'มกราคม': 1,
    'ก.พ.': 2, 'กพ': 2, 'กุมภาพันธ์': 2,
    'มี.ค.': 3, 'มีค': 3, 'มีนาคม': 3,
    'เม.ย.': 4, 'เมย': 4, 'เมษายน': 4,
    'พ.ค.': 5, 'พค': 5, 'พฤษภาคม': 5,
    'มิ.ย.': 6, 'มิย': 6, 'มิถุนายน': 6,
    'ก.ค.': 7, 'กค': 7, 'กรกฎาคม': 7,
    'ส.ค.': 8, 'สค': 8, 'สิงหาคม': 8,
    'ก.ย.': 9, 'กย': 9, 'กันยายน': 9,
    'ต.ค.': 10, 'ตค': 10, 'ตุลาคม': 10,
    'พ.ย.': 11, 'พย': 11, 'พฤศจิกายน': 11,
    'ธ.ค.': 12, 'ธค': 12, 'ธันวาคม': 12
  };

  return months[key] || null;
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.-]/gu, '');
}

module.exports = {
  getCurrentMonthKey,
  getPreviousMonthKey,
  isToday,
  isCurrentMonth,
  parseTransactionDate,
  normalizeText
};
