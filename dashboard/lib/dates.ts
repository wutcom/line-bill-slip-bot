function pad2(value: number | string): string {
  return String(value).padStart(2, '0');
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function getCurrentPlanMonthKey(date: Date = new Date(), cutoffDay: number = 15): string {
  const planMonth = new Date(date.getFullYear(), date.getMonth(), 1);

  if (date.getDate() <= cutoffDay) {
    planMonth.setMonth(planMonth.getMonth() - 1);
  }

  return getCurrentMonthKey(planMonth);
}

export interface MonthBounds {
  monthKey: string;
  monthStart: string;
  nextMonthStart: string;
}

export function getMonthBounds(monthKey: string = getCurrentMonthKey()): MonthBounds {
  const [year, month] = String(monthKey).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));

  return {
    monthKey: `${year}-${pad2(month)}`,
    monthStart: start.toISOString().slice(0, 10),
    nextMonthStart: next.toISOString().slice(0, 10)
  };
}

