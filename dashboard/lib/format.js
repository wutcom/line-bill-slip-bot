function formatMoney(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0
  }).format(amount);
}

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

module.exports = {
  formatMoney,
  formatNumber,
  formatPercent
};
