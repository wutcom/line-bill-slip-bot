function getCurrentMonthKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
}

function getPreviousMonthKey() {
  const now = new Date();

  now.setMonth(now.getMonth() - 1);

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
}

function isToday(dateText) {
  return true;
}

function isCurrentMonth(dateText) {
  return true;
}

module.exports = {
  getCurrentMonthKey,
  getPreviousMonthKey,
  isToday,
  isCurrentMonth
};
