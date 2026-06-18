'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { formatNumber } from '../lib/format';

interface FoodLog {
  id: number;
  source_row_id: string;
  created_at: string | null;
  message_id: string | null;
  user_id: string | null;
  log_date: string;
  meal_name: string | null;
  source_type: string | null;
  detected_food: string | null;
  user_portion_text: string | null;
  estimated_kcal: number | null;
  estimated_kcal_min: number | null;
  estimated_kcal_max: number | null;
  protein_g: number | null;
  protein_goal_g: number | null;
  carb_g: number | null;
  carb_goal_g: number | null;
  fat_g: number | null;
  fat_goal_g: number | null;
  weight_kg: number | null;
  waist_inch: number | null;
  sugar_level: string | null;
  sodium_level: string | null;
  confidence: number | null;
  note: string | null;
  raw_text: string | null;
  source: string;
  synced_at: string | null;
  updated_at: string | null;
}

interface Summary {
  todayEstimatedKcal: number;
  todayEstimatedKcalMin: number;
  todayEstimatedKcalMax: number;
  todayProtein: number;
  todayProteinGoal: number;
  todayCarbs: number;
  todayCarbsGoal: number;
  todayFat: number;
  todayFatGoal: number;
  latestWeight: number | null;
  latestWaist: number | null;
  averageConfidence: number;
  totalMealsToday: number;
  monthlyEstimatedKcal: number;
}

interface FoodLogDashboardProps {
  users: Array<{ id: number; line_user_id: string; display_name: string }>;
  selectedUserId: string;
}

export default function FoodLogDashboard({ users, selectedUserId }: FoodLogDashboardProps) {
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [mealNameFilter, setMealNameFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState(selectedUserId);

  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [summary, setSummary] = useState<Summary>({
    todayEstimatedKcal: 0,
    todayEstimatedKcalMin: 0,
    todayEstimatedKcalMax: 0,
    todayProtein: 0,
    todayProteinGoal: 0,
    todayCarbs: 0,
    todayCarbsGoal: 0,
    todayFat: 0,
    todayFatGoal: 0,
    latestWeight: null,
    latestWaist: null,
    averageConfidence: 0,
    totalMealsToday: 0,
    monthlyEstimatedKcal: 0
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeLog, setActiveLog] = useState<FoodLog | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        userId: userIdFilter,
        date: dateFilter,
        month: monthFilter,
        mealName: mealNameFilter,
        sourceType: sourceTypeFilter,
        search: searchFilter
      });

      const [logsRes, summaryRes] = await Promise.all([
        fetch(`/api/food-log?${queryParams.toString()}`),
        fetch(`/api/food-log/summary?userId=${userIdFilter}`)
      ]);

      if (logsRes.ok && summaryRes.ok) {
        const logsData = await logsRes.json();
        const summaryData = await summaryRes.json();
        setLogs(logsData);
        setSummary(summaryData);
      } else {
        console.error('Error fetching food logs data');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userIdFilter, dateFilter, monthFilter, mealNameFilter, sourceTypeFilter, searchFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClearFilters = () => {
    setDateFilter('');
    setMonthFilter('');
    setMealNameFilter('');
    setSourceTypeFilter('');
    setSearchFilter('');
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sync/food-log', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setStatusMessage({ type: 'success', text: 'Food logs sync completed successfully!' });
        fetchData();
      } else {
        setStatusMessage({ type: 'error', text: `Sync failed: ${result.error || 'Unknown error'}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Sync request failed: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const formatConfidence = (val: number | null): string => {
    if (val === null) return '-';
    // If confidence is normalized to 0-1, format as percent
    const percent = val <= 1 ? Math.round(val * 100) : Math.round(val);
    return `${percent}%`;
  };

  return (
    <div className="category-layout">
      {/* Header and Sync Button */}
      <div className="toolbar" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
        <div>
          <p className="eyebrow">Personal Health Dashboard</p>
          <h2 style={{ fontSize: '28px' }}>Food Log</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase' }}>User Scope</span>
            <select 
              value={userIdFilter} 
              onChange={e => {
                setUserIdFilter(e.target.value);
                const url = new URL(window.location.href);
                url.searchParams.set('userId', e.target.value);
                window.history.pushState({}, '', url.toString());
              }}
              style={{ height: '38px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', padding: '0 8px' }}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </label>
          <button 
            onClick={handleSync} 
            disabled={syncing}
            className="action-link"
            style={{ 
              opacity: syncing ? 0.7 : 1, 
              cursor: syncing ? 'not-allowed' : 'pointer',
              background: syncing ? '#6b7280' : 'var(--accent)'
            }}
          >
            {syncing ? '🔄 Syncing...' : 'Sync Food Log'}
          </button>
        </div>
      </div>

      {/* Sync Status Feedback */}
      {statusMessage && (
        <div className="notice" style={{ borderLeft: `4px solid ${statusMessage.type === 'success' ? 'var(--good)' : 'var(--danger)'}`, background: statusMessage.type === 'success' ? '#ecfdf5' : '#fef2f2' }}>
          <strong style={{ color: statusMessage.type === 'success' ? 'var(--good)' : 'var(--danger)' }}>
            {statusMessage.type === 'success' ? 'Success' : 'Sync Error'}
          </strong>
          <p style={{ color: statusMessage.type === 'success' ? '#065f46' : '#991b1b' }}>{statusMessage.text}</p>
        </div>
      )}

      {/* Summary Metrics Row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', margin: '8px 0 16px' }}>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Today Calories</span>
          <strong style={{ fontSize: '20px', color: 'var(--accent)', alignSelf: 'end' }}>{formatNumber(summary.todayEstimatedKcal)} kcal</strong>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Calorie Range</span>
          <strong style={{ fontSize: '18px', alignSelf: 'end' }}>{formatNumber(summary.todayEstimatedKcalMin)} - {formatNumber(summary.todayEstimatedKcalMax)}</strong>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Protein</span>
          <strong style={{ fontSize: '18px', alignSelf: 'end' }}>{formatNumber(summary.todayProtein)}g</strong>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Goal: {formatNumber(summary.todayProteinGoal)}g</span>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Carbs</span>
          <strong style={{ fontSize: '18px', alignSelf: 'end' }}>{formatNumber(summary.todayCarbs)}g</strong>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Goal: {formatNumber(summary.todayCarbsGoal)}g</span>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Fat</span>
          <strong style={{ fontSize: '18px', alignSelf: 'end' }}>{formatNumber(summary.todayFat)}g</strong>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Goal: {formatNumber(summary.todayFatGoal)}g</span>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Latest Weight</span>
          <strong style={{ fontSize: '20px', alignSelf: 'end' }}>{summary.latestWeight ? `${formatNumber(summary.latestWeight)} kg` : '-'}</strong>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Latest Waist</span>
          <strong style={{ fontSize: '20px', alignSelf: 'end' }}>{summary.latestWaist ? `${formatNumber(summary.latestWaist)} in` : '-'}</strong>
        </div>
        <div className="kpi info" style={{ minHeight: '94px', padding: '12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--muted)' }}>Avg Confidence</span>
          <strong style={{ fontSize: '20px', alignSelf: 'end' }}>{formatConfidence(summary.averageConfidence)}</strong>
        </div>
      </section>

      {/* Filters Form */}
      <div className="inline-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
        <label>
          <span>Date</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </label>
        <label>
          <span>Month</span>
          <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
        </label>
        <label>
          <span>Meal Name</span>
          <input type="text" placeholder="e.g. Lunch" value={mealNameFilter} onChange={e => setMealNameFilter(e.target.value)} />
        </label>
        <label>
          <span>Source Type</span>
          <select value={sourceTypeFilter} onChange={e => setSourceTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          <span>Search</span>
          <input type="text" placeholder="Search food, portion, note..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
        </label>
        <button 
          onClick={handleClearFilters}
          style={{ height: '42px', background: '#6b7280', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '800' }}
        >
          Clear
        </button>
      </div>

      {/* Data Table */}
      <section className="section-block table-section">
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)', fontWeight: '800' }}>
            <span>⏳ Loading food log data...</span>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
              No food log data yet. Sync data from Google Sheets first.
            </p>
            <button 
              onClick={handleSync}
              disabled={syncing}
              className="page-link"
              style={{ display: 'inline-flex', gap: '8px' }}
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Log Date</th>
                  <th>Meal Name</th>
                  <th>Detected Food</th>
                  <th>Portion</th>
                  <th>Estimated Kcal</th>
                  <th>Protein</th>
                  <th>Carbs</th>
                  <th>Fat</th>
                  <th>Confidence</th>
                  <th>Source Type</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>
                      <strong>
                        {new Date(log.log_date).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </strong>
                    </td>
                    <td><span className="status-pill">{log.meal_name || '-'}</span></td>
                    <td><strong>{log.detected_food || '-'}</strong></td>
                    <td>{log.user_portion_text || '-'}</td>
                    <td className="amount-cell">{log.estimated_kcal !== null ? `${formatNumber(log.estimated_kcal)} kcal` : '-'}</td>
                    <td>{log.protein_g !== null ? `${formatNumber(log.protein_g)}g` : '-'}</td>
                    <td>{log.carb_g !== null ? `${formatNumber(log.carb_g)}g` : '-'}</td>
                    <td>{log.fat_g !== null ? `${formatNumber(log.fat_g)}g` : '-'}</td>
                    <td>{formatConfidence(log.confidence)}</td>
                    <td>
                      <span className={`status-pill ${log.source_type === 'image' ? 'confirmed' : ''}`}>
                        {log.source_type || '-'}
                      </span>
                    </td>
                    <td>
                      <small title={log.note || ''}>
                        {log.note || '-'}
                      </small>
                    </td>
                    <td>
                      <button 
                        onClick={() => setActiveLog(log)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: '800', padding: '0' }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Details Modal */}
      {activeLog && (
        <div className="modal-overlay" onClick={() => setActiveLog(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Food Log Details</h3>
              <button className="modal-close-btn" onClick={() => setActiveLog(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label>Raw Text</label>
                <div className="modal-field-value pre">{activeLog.raw_text || '-'}</div>
              </div>
              <div className="modal-field">
                <label>Sugar Level</label>
                <div className="modal-field-value">{activeLog.sugar_level || '-'}</div>
              </div>
              <div className="modal-field">
                <label>Sodium Level</label>
                <div className="modal-field-value">{activeLog.sodium_level || '-'}</div>
              </div>
              <div className="modal-field">
                <label>Created At</label>
                <div className="modal-field-value">
                  {activeLog.created_at ? new Date(activeLog.created_at).toLocaleString('th-TH') : '-'}
                </div>
              </div>
              <div className="modal-field">
                <label>Message ID</label>
                <div className="modal-field-value">{activeLog.message_id || '-'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
