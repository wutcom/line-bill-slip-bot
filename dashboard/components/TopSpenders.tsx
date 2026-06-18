import { formatMoney, formatNumber } from '../lib/format';
import { OverviewData } from '../lib/queries/overview';

interface TopSpendersProps {
  rows?: OverviewData['topShops'];
}

export default function TopSpenders({ rows = [] }: TopSpendersProps) {
  return (
    <section className="section-block payment-destinations">
      <div className="section-heading">
        <h3>Top Payment Destinations</h3>
        <p>Largest spending destinations this month by total amount.</p>
      </div>

      <div className="rank-list">
        {rows.length === 0 ? <p className="empty-line">No payment destinations yet.</p> : null}
        {rows.map((row, index) => (
          <div className="rank-row" key={`${row.shopName}-${index}`}>
            <span className="rank-badge">{index + 1}</span>
            <div className="rank-details">
              <strong>{row.shopName}</strong>
              <small>{formatNumber(row.transactionCount)} transactions</small>
            </div>
            <b className="rank-amount">{formatMoney(row.totalAmount)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}


