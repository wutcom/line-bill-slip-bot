import { formatMoney, formatNumber } from '../lib/format';
import { CategoryAnalyticsData, CategoryAnalytic, MonthlyTrend } from '../lib/queries/categories';

export default function CategoryAnalytics({ data }: { data: CategoryAnalyticsData }) {
  const max = Math.max(...data.categories.map((row: CategoryAnalytic) => row.totalAmount), 1);
  const total = data.categories.reduce((sum: number, row: CategoryAnalytic) => sum + row.totalAmount, 0);

  return (
    <div className="category-layout">
      <section className="budget-summary">
        <div>
          <span>Total category spend</span>
          <strong>{formatMoney(total)}</strong>
        </div>
        <div>
          <span>Active categories</span>
          <strong>{formatNumber(data.categories.length)}</strong>
        </div>
        <div>
          <span>Top category</span>
          <strong>{data.categories[0]?.categoryName || '-'}</strong>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h3>Category ranking</h3>
          <p>Confirmed expenses grouped by category.</p>
        </div>

        <div className="bar-list">
          {data.categories.length === 0 ? <p className="empty-line">No category data for this month.</p> : null}
          {data.categories.map((row: CategoryAnalytic) => (
            <div className="bar-row category-row" key={row.categoryCode}>
              <div className="bar-meta">
                <span>{row.categoryName}</span>
                <strong>{formatMoney(row.totalAmount)}</strong>
              </div>
              <div className="bar-track" aria-hidden="true">
                <div style={{ width: `${Math.max((row.totalAmount / max) * 100, 4)}%` }} />
              </div>
              <small>{formatNumber(row.transactionCount)} transactions, avg {formatMoney(row.averageAmount)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h3>Monthly category trend</h3>
          <p>Last six months grouped by category.</p>
        </div>

        <div className="trend-list">
          {data.monthlyTrend.length === 0 ? <p className="empty-line">No monthly trend yet.</p> : null}
          {data.monthlyTrend.slice(0, 24).map((row: MonthlyTrend, index: number) => (
            <div className="trend-row" key={`${row.month}-${row.categoryName}-${index}`}>
              <span>{row.month}</span>
              <strong>{row.categoryName}</strong>
              <b>{formatMoney(row.totalAmount)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

