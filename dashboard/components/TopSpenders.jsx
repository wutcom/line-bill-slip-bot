import { formatMoney, formatNumber } from '../lib/format';

export default function TopSpenders({ rows = [], latestSync }) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <h3>Top shops and banks</h3>
        <p>Largest confirmed spending destinations this month.</p>
      </div>

      <div className="rank-list">
        {rows.length === 0 ? <p className="empty-line">No spending destinations yet.</p> : null}
        {rows.map((row, index) => (
          <div className="rank-row" key={`${row.shopName}-${index}`}>
            <span>{index + 1}</span>
            <div>
              <strong>{row.shopName}</strong>
              <small>{formatNumber(row.transactionCount)} transactions</small>
            </div>
            <b>{formatMoney(row.totalAmount)}</b>
          </div>
        ))}
      </div>

      <div className={`sync-status ${latestSync?.status || 'unknown'}`}>
        <span>Last sync</span>
        <strong>{latestSync?.finished_at ? new Date(latestSync.finished_at).toLocaleString('th-TH') : 'No sync run'}</strong>
      </div>
    </section>
  );
}
