const PLAN_CUTOFF_DAY = 15;

function getCurrentMonthKey() {
  const now = new Date();

  return formatMonthKey(now);
}

function getPreviousMonthKey() {
  const now = new Date();

  now.setMonth(now.getMonth() - 1);

  return formatMonthKey(now);
}

function getCurrentPlanMonthKey(referenceDate = new Date(), cutoffDay = PLAN_CUTOFF_DAY) {
  const date = toDate(referenceDate);
  const planMonth = new Date(date.getFullYear(), date.getMonth(), 1);

  if (date.getDate() <= cutoffDay) {
    planMonth.setMonth(planMonth.getMonth() - 1);
  }

  return formatMonthKey(planMonth);
}

function getPreviousPlanMonthKey(referenceDate = new Date(), cutoffDay = PLAN_CUTOFF_DAY) {
  const [year, month] = getCurrentPlanMonthKey(referenceDate, cutoffDay).split('-').map(Number);
  const previousPlanMonth = new Date(year, month - 2, 1);

  return formatMonthKey(previousPlanMonth);
}

function getPlanCycleRange(planMonthKey, cutoffDay = PLAN_CUTOFF_DAY) {
  const match = String(planMonthKey || '').match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid plan month key: ${planMonthKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  return {
    start: new Date(year, month - 1, cutoffDay + 1),
    end: new Date(year, month, cutoffDay, 23, 59, 59, 999)
  };
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

function isCurrentPlanCycle(dateText, referenceDate = new Date(), cutoffDay = PLAN_CUTOFF_DAY) {
  const parsedDate = parseTransactionDate(dateText);
  if (!parsedDate) return false;

  const range = getPlanCycleRange(getCurrentPlanMonthKey(referenceDate, cutoffDay), cutoffDay);

  return parsedDate >= range.start && parsedDate <= range.end;
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  let match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return buildDate(match[1], match[2], match[3]);

  match = text.match(/(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
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

  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;

  return date;
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function getThaiMonthNumber(monthText) {
  const key = String(monthText || '')
    .replace(/\s/g, '')
    .replace(/\./g, '');

  const months = {
    '\u0e21\u0e04': 1,
    '\u0e21\u0e01\u0e23\u0e32\u0e04\u0e21': 1,
    '\u0e01\u0e1e': 2,
    '\u0e01\u0e38\u0e21\u0e20\u0e32\u0e1e\u0e31\u0e19\u0e18\u0e4c': 2,
    '\u0e21\u0e35\u0e04': 3,
    '\u0e21\u0e35\u0e19\u0e32\u0e04\u0e21': 3,
    '\u0e40\u0e21\u0e22': 4,
    '\u0e40\u0e21\u0e29\u0e32\u0e22\u0e19': 4,
    '\u0e1e\u0e04': 5,
    '\u0e1e\u0e24\u0e29\u0e20\u0e32\u0e04\u0e21': 5,
    '\u0e21\u0e34\u0e22': 6,
    '\u0e21\u0e34\u0e16\u0e38\u0e19\u0e32\u0e22\u0e19': 6,
    '\u0e01\u0e04': 7,
    '\u0e01\u0e23\u0e01\u0e0e\u0e32\u0e04\u0e21': 7,
    '\u0e2a\u0e04': 8,
    '\u0e2a\u0e34\u0e07\u0e2b\u0e32\u0e04\u0e21': 8,
    '\u0e01\u0e22': 9,
    '\u0e01\u0e31\u0e19\u0e22\u0e32\u0e22\u0e19': 9,
    '\u0e15\u0e04': 10,
    '\u0e15\u0e38\u0e25\u0e32\u0e04\u0e21': 10,
    '\u0e1e\u0e22': 11,
    '\u0e1e\u0e24\u0e28\u0e08\u0e34\u0e01\u0e32\u0e22\u0e19': 11,
    '\u0e18\u0e04': 12,
    '\u0e18\u0e31\u0e19\u0e27\u0e32\u0e04\u0e21': 12
  };

  return months[key] || null;
}

module.exports = {
  getCurrentMonthKey,
  getPreviousMonthKey,
  getCurrentPlanMonthKey,
  getPreviousPlanMonthKey,
  getPlanCycleRange,
  isToday,
  isCurrentMonth,
  isCurrentPlanCycle,
  parseTransactionDate,
  PLAN_CUTOFF_DAY
};
