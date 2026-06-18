import { formatMoney, formatNumber } from '../lib/format';
import { OverviewData } from '../lib/queries/overview';

export default function KpiStrip({ overview }: { overview: OverviewData }) {
  const limit = overview.totalBudget;
  const spent = overview.totalExpense;
  const remaining = overview.remainingBudget;
  
  // Calculate budget usage percentage
  const usagePercent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  
  // Determine tone for the budget card (good: green, warning: yellow, danger: red)
  let budgetTone = 'info'; // Default if no budget
  if (limit > 0) {
    if (remaining < 0 || usagePercent >= 100) {
      budgetTone = 'danger'; // Red
    } else if (usagePercent >= 80) {
      budgetTone = 'warning'; // Yellow
    } else {
      budgetTone = 'good'; // Green
    }
  }

  return (
    <section className="kpi-strip" aria-label="Selected KPIs">
      {/* Month spending */}
      <div className="kpi info">
        <span>Total Monthly Spending</span>
        <strong>{formatMoney(spent)}</strong>
        <span className="kpi-subtext">Current month scope</span>
      </div>

      {/* Budget remaining (Progress Bar Card) */}
      <div className={`kpi budget-kpi-card ${budgetTone}`}>
        <div className="budget-kpi-header">
          <span>Remaining Budget</span>
          <strong>{limit > 0 ? formatMoney(remaining) : 'No Budget'}</strong>
        </div>
        {limit > 0 && (
          <div className="budget-progress-wrapper">
            <div className="budget-progress-bar">
              <div 
                className="budget-progress-fill" 
                style={{ width: `${Math.min(usagePercent, 100)}%` }} 
              />
            </div>
            <div className="budget-progress-info">
              <span>{usagePercent}% used of {formatMoney(limit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Today */}
      <div className="kpi info">
        <span>Spend Today</span>
        <strong>{formatMoney(overview.todayExpense)}</strong>
        <span className="kpi-subtext">Today's transactions</span>
      </div>

      {/* Transactions */}
      <div className="kpi info">
        <span>Transaction Count</span>
        <strong>{formatNumber(overview.transactionCount)}</strong>
        <span className="kpi-subtext">Total transactions</span>
      </div>
    </section>
  );
}
