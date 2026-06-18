import { query } from '../db';
import { resolveUserId } from './users';

export interface BodyMetricRow {
  id: number;
  recorded_date: string;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  muscle_mass: number | null;
  waist: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  note: string | null;
}

export interface BodyMetricsData {
  userId: number | null;
  latest: BodyMetricRow | null;
  previous: BodyMetricRow | null;
  history: BodyMetricRow[];
}

export async function getBodyMetrics({ userId }: { userId?: string | number | null } = {}): Promise<BodyMetricsData> {
  const resolvedUserId = await resolveUserId(userId);

  if (!resolvedUserId) {
    return { userId: null, latest: null, previous: null, history: [] };
  }

  const [historyResult] = await Promise.all([
    query<BodyMetricRow>(
      `SELECT id, recorded_date::text AS recorded_date,
              weight::float AS weight, height::float AS height,
              bmi::float AS bmi, body_fat_pct::float AS body_fat_pct,
              muscle_mass::float AS muscle_mass, waist::float AS waist,
              bp_systolic, bp_diastolic, note
       FROM body_metrics
       WHERE user_id = $1
       ORDER BY recorded_date DESC
       LIMIT 60`,
      [resolvedUserId]
    )
  ]);

  const history = historyResult.rows;
  const latest = history[0] || null;
  const previous = history[1] || null;

  return {
    userId: resolvedUserId,
    latest,
    previous,
    history
  };
}
