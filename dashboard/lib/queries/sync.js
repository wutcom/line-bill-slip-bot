const { query } = require('../db');

async function getSyncMonitor() {
  const [runs, errors] = await Promise.all([
    query(
      `SELECT
         id,
         job_name,
         started_at,
         finished_at,
         status,
         rows_read,
         rows_inserted,
         rows_updated,
         error_message
       FROM sync_runs
       ORDER BY started_at DESC
       LIMIT 20`
    ),
    query(
      `SELECT
         e.id,
         e.sync_run_id,
         e.sheet_name,
         e.sheet_row,
         e.error_message,
         e.created_at
       FROM sync_row_errors e
       ORDER BY e.created_at DESC
       LIMIT 30`
    )
  ]);

  const latest = runs.rows[0] || null;

  return {
    latest,
    runs: runs.rows,
    errors: errors.rows
  };
}

module.exports = {
  getSyncMonitor
};
