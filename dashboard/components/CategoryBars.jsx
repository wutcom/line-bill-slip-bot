import { formatMoney } from '../lib/format';

export default function CategoryBars({ rows = [] }) {
  const max = Math.max(...rows.map((row) => row.totalAmount), 1);

  return (
    <section className="section-block">
      <div className="section-heading">
        <h3>Category spending</h3>
        <p>Confirmed expenses for the selected month.</p>
      </div>

      <div className="bar-list">
        {rows.length === 0 ? <EmptyLine text="No category spending yet." /> : null}
        {rows.map((row) => (
          <div className="bar-row" key={row.categoryName}>
            <div className="bar-meta">
              <span>{row.categoryName}</span>
              <strong>{formatMoney(row.totalAmount)}</strong>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div style={{ width: `${Math.max((row.totalAmount / max) * 100, 4)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyLine({ text }) {
  return <p className="empty-line">{text}</p>;
}
