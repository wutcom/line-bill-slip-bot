import { formatMoney, formatNumber } from '../lib/format';

export default function KpiStrip({ overview }) {
  const kpis = [
    { label: 'Month spending', value: formatMoney(overview.totalExpense), tone: 'strong' },
    { label: 'Budget remaining', value: formatMoney(overview.remainingBudget), tone: overview.remainingBudget < 0 ? 'danger' : 'good' },
    { label: 'Today', value: formatMoney(overview.todayExpense), tone: 'neutral' },
    { label: 'Transactions', value: formatNumber(overview.transactionCount), tone: 'neutral' }
  ];

  return (
    <section className="kpi-strip" aria-label="Selected KPIs">
      {kpis.map((kpi) => (
        <div className={`kpi ${kpi.tone}`} key={kpi.label}>
          <span>{kpi.label}</span>
          <strong>{kpi.value}</strong>
        </div>
      ))}
    </section>
  );
}
