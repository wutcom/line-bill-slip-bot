export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value || 0);

  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}

export function formatPercent(value: number | string | null | undefined): string {
  return `${Math.round(Number(value || 0))}%`;
}

