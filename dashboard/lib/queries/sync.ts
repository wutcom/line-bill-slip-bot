import { query } from '../db';

export interface SyncRun {
  id: number;
  job_name: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  status: string;
  rows_read: number;
  rows_inserted: number;
  rows_updated: number;
  error_message: string | null;
  metadata?: any;
}

export interface SyncRowError {
  id: number;
  sync_run_id: number;
  sheet_name: string;
  sheet_row: number;
  error_message: string;
  created_at: Date | string;
}

export interface SyncMonitorData {
  latest: SyncRun | null;
  runs: SyncRun[];
  errors: SyncRowError[];
}

export async function getSyncMonitor(): Promise<SyncMonitorData> {
  const [runs, errors] = await Promise.all([
    query<SyncRun>(
      `SELECT
         id,
         job_name,
         started_at,
         finished_at,
         status,
         rows_read,
         rows_inserted,
         rows_updated,
         error_message,
         metadata
       FROM sync_runs
       ORDER BY started_at DESC
       LIMIT 20`
    ),
    query<SyncRowError>(
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

