'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../lib/format';

export default function SpendingChart({ rows = [] }) {
  return (
    <section className="section-block chart-block">
      <div className="section-heading">
        <h3>Daily trend</h3>
        <p>Spending movement across the selected month.</p>
      </div>

      <div className="chart-frame">
        {rows.length === 0 ? (
          <p className="empty-line">No daily trend yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="spendingFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip formatter={(value) => formatMoney(value)} labelStyle={{ color: '#111827' }} />
              <Area type="monotone" dataKey="totalAmount" stroke="#0f766e" strokeWidth={2} fill="url(#spendingFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
