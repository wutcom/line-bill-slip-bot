function pad2(value) {
  return String(value).padStart(2, '0');
}

function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function getMonthBounds(monthKey = getCurrentMonthKey()) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));

  return {
    monthKey: `${year}-${pad2(month)}`,
    monthStart: start.toISOString().slice(0, 10),
    nextMonthStart: next.toISOString().slice(0, 10)
  };
}

module.exports = {
  getCurrentMonthKey,
  getMonthBounds
};
