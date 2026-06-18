import { formatNumber } from '../lib/format';
import { SyncMonitorData } from '../lib/queries/sync';

export default function SyncMonitor({ data }: { data: SyncMonitorData }) {
  const latest = data.latest;

  return (
    <div className="sync-layout">
      <section className="section-intro">
        <p className="eyebrow">System health</p>
        <h2>Sync Monitor</h2>
        <p>Track Google Sheets to PostgreSQL sync runs and row-level failures.</p>
      </section>

      <section className="kpi-strip sync-kpis">
        <div className={`kpi ${latest?.status === 'success' ? 'good' : latest ? 'danger' : 'neutral'}`}>
          <span>Latest status</span>
          <strong>{latest?.status || 'No runs'}</strong>
        </div>
        <div className="kpi">
          <span>Rows read</span>
          <strong>{formatNumber(latest?.rows_read || 0)}</strong>
        </div>
        <div className="kpi">
          <span>Inserted</span>
          <strong>{formatNumber(latest?.rows_inserted || 0)}</strong>
        </div>
        <div className="kpi">
          <span>Updated</span>
          <strong>{formatNumber(latest?.rows_updated || 0)}</strong>
        </div>
      </section>

      {/* Component breakdown table */}
      <section className="section-block table-section">
        <div className="section-heading">
          <h3>Component sync details</h3>
          <p>Breakdown status of individual Google Sheet worksheets.</p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Rows Read</th>
                <th>Rows Synced</th>
                <th>Rows Skipped</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Food Log */}
              <tr>
                <td><strong>Food Log</strong></td>
                <td>{formatNumber(latest?.metadata?.foodLogStats?.rowsRead || 0)}</td>
                <td>{formatNumber((latest?.metadata?.foodLogStats?.rowsInserted || 0) + (latest?.metadata?.foodLogStats?.rowsUpdated || 0))}</td>
                <td>{formatNumber((latest?.metadata?.foodLogStats?.rowsRead || 0) - ((latest?.metadata?.foodLogStats?.rowsInserted || 0) + (latest?.metadata?.foodLogStats?.rowsUpdated || 0)))}</td>
                <td>
                  <span className={`status-pill ${latest?.status === 'success' ? 'success' : latest?.status === 'failed' ? 'failed' : 'neutral'}`}>
                    {latest?.status === 'success' ? 'Synced' : latest?.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </td>
              </tr>
              {/* Transactions */}
              <tr>
                <td><strong>Transactions</strong></td>
                <td>{formatNumber(latest?.metadata?.transactionStats?.rowsRead || 0)}</td>
                <td>{formatNumber((latest?.metadata?.transactionStats?.rowsInserted || 0) + (latest?.metadata?.transactionStats?.rowsUpdated || 0))}</td>
                <td>{formatNumber((latest?.metadata?.transactionStats?.rowsRead || 0) - ((latest?.metadata?.transactionStats?.rowsInserted || 0) + (latest?.metadata?.transactionStats?.rowsUpdated || 0)))}</td>
                <td>
                  <span className={`status-pill ${latest?.status === 'success' ? 'success' : latest?.status === 'failed' ? 'failed' : 'neutral'}`}>
                    {latest?.status === 'success' ? 'Synced' : latest?.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </td>
              </tr>
              {/* Budget Plan */}
              <tr>
                <td><strong>Budget Plans</strong></td>
                <td>{formatNumber(latest?.metadata?.budgetStats?.rowsRead || 0)}</td>
                <td>{formatNumber((latest?.metadata?.budgetStats?.rowsInserted || 0) + (latest?.metadata?.budgetStats?.rowsUpdated || 0))}</td>
                <td>{formatNumber((latest?.metadata?.budgetStats?.rowsRead || 0) - ((latest?.metadata?.budgetStats?.rowsInserted || 0) + (latest?.metadata?.budgetStats?.rowsUpdated || 0)))}</td>
                <td>
                  <span className={`status-pill ${latest?.status === 'success' ? 'success' : latest?.status === 'failed' ? 'failed' : 'neutral'}`}>
                    {latest?.status === 'success' ? 'Synced' : latest?.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </td>
              </tr>
              {/* Budget Payments */}
              <tr>
                <td><strong>Budget Payments</strong></td>
                <td>{formatNumber(latest?.metadata?.budgetPaymentStats?.rowsRead || 0)}</td>
                <td>{formatNumber((latest?.metadata?.budgetPaymentStats?.rowsInserted || 0) + (latest?.metadata?.budgetPaymentStats?.rowsUpdated || 0))}</td>
                <td>{formatNumber((latest?.metadata?.budgetPaymentStats?.rowsRead || 0) - ((latest?.metadata?.budgetPaymentStats?.rowsInserted || 0) + (latest?.metadata?.budgetPaymentStats?.rowsUpdated || 0)))}</td>
                <td>
                  <span className={`status-pill ${latest?.status === 'success' ? 'success' : latest?.status === 'failed' ? 'failed' : 'neutral'}`}>
                    {latest?.status === 'success' ? 'Synced' : latest?.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </td>
              </tr>
              {/* Body Metrics */}
              <tr>
                <td><strong>Body Metrics</strong></td>
                <td>{formatNumber(latest?.metadata?.bodyMetricsStats?.rowsRead || 0)}</td>
                <td>{formatNumber((latest?.metadata?.bodyMetricsStats?.rowsInserted || 0) + (latest?.metadata?.bodyMetricsStats?.rowsUpdated || 0))}</td>
                <td>{formatNumber((latest?.metadata?.bodyMetricsStats?.rowsRead || 0) - ((latest?.metadata?.bodyMetricsStats?.rowsInserted || 0) + (latest?.metadata?.bodyMetricsStats?.rowsUpdated || 0)))}</td>
                <td>
                  <span className={`status-pill ${latest?.status === 'success' ? 'success' : latest?.status === 'failed' ? 'failed' : 'neutral'}`}>
                    {latest?.status === 'success' ? 'Synced' : latest?.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {latest?.status === 'failed' && latest?.error_message && (
          <div className="notice" style={{ marginTop: '14px', borderLeft: '4px solid var(--danger)' }}>
            <strong>Sync failure error message:</strong>
            <p>{latest.error_message}</p>
          </div>
        )}
      </section>

      <section className="section-block table-section">
        <div className="section-heading">
          <h3>Recent sync runs</h3>
          <p>Newest runs first.</p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Finished</th>
                <th>Status</th>
                <th>Read</th>
                <th>Inserted</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.length === 0 ? <tr><td colSpan={6}>No sync runs found.</td></tr> : null}
              {data.runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatDateTime(run.started_at)}</td>
                  <td>{formatDateTime(run.finished_at)}</td>
                  <td><span className={`status-pill ${run.status}`}>{run.status}</span></td>
                  <td>{formatNumber(run.rows_read)}</td>
                  <td>{formatNumber(run.rows_inserted)}</td>
                  <td>{formatNumber(run.rows_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-block table-section">
        <div className="section-heading">
          <h3>Row errors</h3>
          <p>Latest rows that failed during sync.</p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Sheet</th>
                <th>Row</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.errors.length === 0 ? <tr><td colSpan={4}>No row errors found.</td></tr> : null}
              {data.errors.map((error) => (
                <tr key={error.id}>
                  <td>{formatDateTime(error.created_at)}</td>
                  <td>{error.sheet_name}</td>
                  <td>{error.sheet_row || '-'}</td>
                  <td>{error.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH');
}

