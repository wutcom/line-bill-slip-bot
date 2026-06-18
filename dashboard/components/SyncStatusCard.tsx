import { OverviewData } from '../lib/queries/overview';
import { formatNumber } from '../lib/format';

interface SyncStatusCardProps {
  latestSync: OverviewData['latestSync'];
  totalDbTransactions: number;
}

export default function SyncStatusCard({ latestSync, totalDbTransactions }: SyncStatusCardProps) {
  const metadata = latestSync?.metadata as any;
  const sheetsCount = metadata?.transactionStats?.rowsRead || 0;
  const dbCount = totalDbTransactions;
  const diff = Math.abs(sheetsCount - dbCount);

  // Status determination
  let status: 'good' | 'warning' | 'danger' = 'good';
  let message = 'All transaction records are fully in sync.';

  if (latestSync?.status === 'failed') {
    status = 'danger';
    message = `Last sync failed: ${latestSync.error_message || 'Unknown error'}`;
  } else if (diff > 0) {
    if (diff <= 5) {
      status = 'warning';
      message = `${diff} record(s) pending sync from Google Sheets.`;
    } else {
      status = 'danger';
      message = `${diff} records out of sync — check sync process.`;
    }
  }

  const statusLabel = status === 'good' ? 'In Sync' : status === 'warning' ? 'Warning' : 'Error';
  const statusColorClass = status === 'good' ? 'good' : status === 'warning' ? 'warning' : 'danger';

  const formatSyncTime = (time: Date | string | null | undefined) => {
    if (!time) return 'No sync runs recorded';
    return new Date(time).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section className={`section-block sync-status-card`}>
      <div className="section-heading">
        <h3>Database Sync Status</h3>
        <p>Comparison between Google Sheets (source of truth) and local database.</p>
      </div>

      <div className="sync-comparison-grid">
        <div className={`sync-status-indicator ${statusColorClass}`}>
          <div className="indicator-icon">
            {status === 'good' ? '✓' : status === 'warning' ? '⚠' : '✗'}
          </div>
          <div className="indicator-details">
            <span className="status-badge">{statusLabel}</span>
            <p className="status-message">{message}</p>
          </div>
        </div>

        <div className="sync-metric-boxes">
          <div className="metric-box">
            <span className="metric-label">Google Sheets Records</span>
            <strong className="metric-value">{formatNumber(sheetsCount)}</strong>
          </div>
          <div className="metric-box">
            <span className="metric-label">PostgreSQL Records</span>
            <strong className="metric-value">{formatNumber(dbCount)}</strong>
          </div>
          <div className={`metric-box ${diff > 0 ? (status === 'danger' ? 'danger-text' : 'warning-text') : ''}`}>
            <span className="metric-label">Difference</span>
            <strong className="metric-value">{diff > 0 ? `-${diff}` : '0'}</strong>
          </div>
        </div>
      </div>

      <div className="sync-status-footer">
        <div className="footer-item">
          <span>Last Sync Run:</span>
          <strong>{formatSyncTime(latestSync?.finished_at)}</strong>
        </div>
        <div className="footer-item">
          <span>Sync Status:</span>
          <span className={`status-pill ${latestSync?.status || 'unknown'}`}>{latestSync?.status || 'Unknown'}</span>
        </div>
      </div>
    </section>
  );
}
