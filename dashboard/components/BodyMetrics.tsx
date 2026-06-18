'use client';

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { BodyMetricsData, BodyMetricRow } from '../lib/queries/bodyMetrics';

interface BodyMetricsProps {
  data: BodyMetricsData;
}

export default function BodyMetrics({ data }: BodyMetricsProps) {
  const { latest, previous, history } = data;
  const chartData = [...history].reverse();

  return (
    <div className="category-layout">
      {/* KPI Cards */}
      <div className="kpi-strip">
        <KpiCard label="Weight" value={fmt(latest?.weight)} unit="kg" change={delta(latest?.weight, previous?.weight)} />
        <KpiCard label="BMI" value={fmt(latest?.bmi)} unit="" change={delta(latest?.bmi, previous?.bmi)} />
        <KpiCard label="Body Fat" value={fmt(latest?.body_fat_pct)} unit="%" change={delta(latest?.body_fat_pct, previous?.body_fat_pct)} />
        <KpiCard label="Muscle Mass" value={fmt(latest?.muscle_mass)} unit="kg" change={delta(latest?.muscle_mass, previous?.muscle_mass)} />
      </div>

      {/* Secondary KPIs */}
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <KpiCard label="Height" value={fmt(latest?.height)} unit="cm" change={null} />
        <KpiCard label="Waist" value={fmt(latest?.waist)} unit="cm" change={delta(latest?.waist, previous?.waist)} />
        <KpiCard label="Blood Pressure" value={latest?.bp_systolic != null ? `${latest.bp_systolic}/${latest.bp_diastolic}` : '-'} unit="mmHg" change={null} />
      </div>

      {/* Weight Trend Chart */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h3>Weight Trend</h3>
            <p>Weight and BMI over time</p>
          </div>
        </div>
        <div className="chart-frame">
          {chartData.length === 0 ? (
            <p className="empty-line">No body metrics data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="recorded_date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="weight" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                <YAxis yAxisId="bmi" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip />
                <Legend />
                <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Weight (kg)" />
                <Line yAxisId="bmi" type="monotone" dataKey="bmi" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="BMI" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Body Composition Chart */}
      {chartData.some(r => r.body_fat_pct != null || r.muscle_mass != null) && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <h3>Body Composition</h3>
              <p>Body fat and muscle mass trends</p>
            </div>
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="recorded_date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="body_fat_pct" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Body Fat (%)" connectNulls />
                <Line type="monotone" dataKey="muscle_mass" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Muscle (kg)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* History Table */}
      <section className="section-block table-section">
        <div className="section-heading">
          <div>
            <h3>History</h3>
            <p>Recent body metric records</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Weight</th>
                <th>Height</th>
                <th>BMI</th>
                <th>Body Fat</th>
                <th>Muscle</th>
                <th>Waist</th>
                <th>BP</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={9} className="empty-line">No records yet.</td></tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{formatDate(row.recorded_date)}</strong></td>
                    <td>{fmt(row.weight)}</td>
                    <td>{fmt(row.height)}</td>
                    <td><BmiPill value={row.bmi} /></td>
                    <td>{row.body_fat_pct != null ? `${row.body_fat_pct}%` : '-'}</td>
                    <td>{fmt(row.muscle_mass)}</td>
                    <td>{fmt(row.waist)}</td>
                    <td>{row.bp_systolic != null ? `${row.bp_systolic}/${row.bp_diastolic}` : '-'}</td>
                    <td><small>{row.note || ''}</small></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, unit, change }: { label: string; value: string; unit: string; change: number | null }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>
        {value}{unit ? <small style={{ fontSize: '0.5em', fontWeight: 600, marginLeft: 4, color: '#6b7280' }}>{unit}</small> : null}
      </strong>
      {change !== null && (
        <small style={{ fontSize: 12, color: change > 0 ? '#ef4444' : change < 0 ? '#10b981' : '#6b7280' }}>
          {change > 0 ? '▲' : change < 0 ? '▼' : '—'} {Math.abs(change).toFixed(1)}
        </small>
      )}
    </div>
  );
}

function BmiPill({ value }: { value: number | null }) {
  if (value == null) return <span>-</span>;
  let className = 'status-pill';
  if (value < 18.5) className += ' needs_review';
  else if (value < 25) className += ' confirmed';
  else if (value < 30) className += ' needs_review';
  else className += ' failed';
  return <span className={className}>{value.toFixed(1)}</span>;
}

function fmt(value: number | null | undefined): string {
  if (value == null) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function delta(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current == null || prev == null) return null;
  return current - prev;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}
