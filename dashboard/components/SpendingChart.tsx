'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../lib/format';
import { OverviewData } from '../lib/queries/overview';

interface SpendingChartProps {
  rows?: OverviewData['dailyTrend'];
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="tooltip-date">{data.date}</div>
        <div className="tooltip-row">
          <span className="tooltip-label">Spent Amount:</span>
          <strong className="tooltip-value text-blue">{formatMoney(data.totalAmount)}</strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Transactions:</span>
          <strong className="tooltip-value">{data.transactionCount} transactions</strong>
        </div>
      </div>
    );
  }
  return null;
}

export default function SpendingChart({ rows = [] }: SpendingChartProps) {
  return (
    <section className="section-block chart-block">
      <div className="section-heading">
        <h3>Daily Spending Trend</h3>
        <p>Total spend and transaction frequency per day.</p>
      </div>

      <div className="chart-frame">
        {rows.length === 0 ? (
          <p className="empty-line">No daily trend yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="spendingFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => {
                  const parts = val.split('-');
                  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : val;
                }}
              />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickLine={false} 
                axisLine={false} 
                width={70}
                tickFormatter={(value) => formatMoney(value)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="totalAmount" stroke="#2563eb" strokeWidth={2} fill="url(#spendingFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}


