function parseAmount(value) {
  if (!value) return 0;

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/บาท/g, '')
    .replace(/THB/gi, '')
    .replace(/[^\d.-]/g, '');

  return Number(cleaned) || 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = {
  parseAmount,
  formatMoney
};
