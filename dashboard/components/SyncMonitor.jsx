import { formatNumber } from '../lib/format';

export default function SyncMonitor({ data }) {
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
              {data.runs.length === 0 ? <tr><td colSpan="6">No sync runs found.</td></tr> : null}
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
              {data.errors.length === 0 ? <tr><td colSpan="4">No row errors found.</td></tr> : null}
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

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH');
}
