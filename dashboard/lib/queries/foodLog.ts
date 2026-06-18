import { query } from '../db';
import { resolveUserId } from './users';

export interface FoodLogFilters {
  userId?: string | number | null;
  date?: string | null;
  month?: string | null;
  mealName?: string | null;
  sourceType?: string | null;
  search?: string | null;
}

export async function resolveLineUserId(userId?: string | number | null): Promise<string | null> {
  const resolvedUserId = await resolveUserId(userId);
  if (!resolvedUserId) return null;

  const result = await query<{ line_user_id: string }>(
    `SELECT line_user_id FROM app_users WHERE id = $1 LIMIT 1`,
    [resolvedUserId]
  );
  return result.rows[0]?.line_user_id || null;
}

export async function getFoodLogs(filters: FoodLogFilters = {}) {
  const lineUserId = await resolveLineUserId(filters.userId);
  
  const where: string[] = [];
  const params: any[] = [];
  
  if (lineUserId) {
    params.push(lineUserId);
    where.push(`user_id = $${params.length}`);
  }
  
  if (filters.date) {
    params.push(filters.date);
    where.push(`log_date = $${params.length}::date`);
  }
  
  if (filters.month) {
    params.push(`${filters.month}-01`);
    params.push(`${filters.month}-01`);
    where.push(`log_date >= $${params.length - 1}::date AND log_date < ($${params.length}::date + INTERVAL '1 month')`);
  }
  
  if (filters.mealName) {
    params.push(filters.mealName);
    where.push(`meal_name = $${params.length}`);
  }
  
  if (filters.sourceType) {
    params.push(filters.sourceType);
    where.push(`source_type = $${params.length}`);
  }
  
  if (filters.search) {
    params.push(`%${String(filters.search).toLowerCase()}%`);
    where.push(`lower(
      COALESCE(detected_food, '') || ' ' ||
      COALESCE(user_portion_text, '') || ' ' ||
      COALESCE(note, '') || ' ' ||
      COALESCE(raw_text, '')
    ) LIKE $${params.length}`);
  }
  
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  
  const result = await query<any>(
    `SELECT
       id,
       source_row_id,
       created_at::text AS created_at,
       message_id,
       user_id,
       log_date::text AS log_date,
       meal_name,
       source_type,
       detected_food,
       user_portion_text,
       estimated_kcal::float AS estimated_kcal,
       estimated_kcal_min::float AS estimated_kcal_min,
       estimated_kcal_max::float AS estimated_kcal_max,
       protein_g::float AS protein_g,
       protein_goal_g::float AS protein_goal_g,
       carb_g::float AS carb_g,
       carb_goal_g::float AS carb_goal_g,
       fat_g::float AS fat_g,
       fat_goal_g::float AS fat_goal_g,
       weight_kg::float AS weight_kg,
       waist_inch::float AS waist_inch,
       sugar_level,
       sodium_level,
       confidence::float AS confidence,
       note,
       raw_text,
       source,
       synced_at::text AS synced_at,
       updated_at::text AS updated_at
     FROM food_logs
     ${whereSql}
     ORDER BY log_date DESC, created_at DESC, id DESC`,
    params
  );
  
  return result.rows;
}

export async function getFoodLogSummary(filters: { userId?: string | number | null } = {}) {
  const lineUserId = await resolveLineUserId(filters.userId);

  if (!lineUserId) {
    return {
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
      monthlyEstimatedKcal: 0,
      latestFoodLogDate: null
    };
  }

  const [todayRes, monthRes, weightRes, waistRes, latestDateRes] = await Promise.all([
    query<{
      today_kcal: number;
      today_kcal_min: number;
      today_kcal_max: number;
      today_protein: number;
      today_protein_goal: number;
      today_carbs: number;
      today_carbs_goal: number;
      today_fat: number;
      today_fat_goal: number;
      avg_confidence: number;
      total_meals: number;
    }>(
      `SELECT
         COALESCE(SUM(estimated_kcal), 0)::float AS today_kcal,
         COALESCE(SUM(estimated_kcal_min), 0)::float AS today_kcal_min,
         COALESCE(SUM(estimated_kcal_max), 0)::float AS today_kcal_max,
         COALESCE(SUM(protein_g), 0)::float AS today_protein,
         COALESCE(MAX(protein_goal_g), 0)::float AS today_protein_goal,
         COALESCE(SUM(carb_g), 0)::float AS today_carbs,
         COALESCE(MAX(carb_goal_g), 0)::float AS today_carbs_goal,
         COALESCE(SUM(fat_g), 0)::float AS today_fat,
         COALESCE(MAX(fat_goal_g), 0)::float AS today_fat_goal,
         COALESCE(AVG(confidence), 0)::float AS avg_confidence,
         COUNT(*)::int AS total_meals
       FROM food_logs
       WHERE user_id = $1 AND log_date = CURRENT_DATE`,
      [lineUserId]
    ),
    query<{ monthly_kcal: number }>(
      `SELECT COALESCE(SUM(estimated_kcal), 0)::float AS monthly_kcal
       FROM food_logs
       WHERE user_id = $1
         AND log_date >= DATE_TRUNC('month', CURRENT_DATE)::date
         AND log_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date`,
      [lineUserId]
    ),
    query<{ weight_kg: number }>(
      `SELECT weight_kg::float AS weight_kg
       FROM food_logs
       WHERE user_id = $1 AND weight_kg IS NOT NULL
       ORDER BY log_date DESC, created_at DESC, id DESC
       LIMIT 1`,
      [lineUserId]
    ),
    query<{ waist_inch: number }>(
      `SELECT waist_inch::float AS waist_inch
       FROM food_logs
       WHERE user_id = $1 AND waist_inch IS NOT NULL
       ORDER BY log_date DESC, created_at DESC, id DESC
       LIMIT 1`,
      [lineUserId]
    ),
    query<{ latest_date: string }>(
      `SELECT log_date::text AS latest_date
       FROM food_logs
       WHERE user_id = $1
       ORDER BY log_date DESC, created_at DESC, id DESC
       LIMIT 1`,
      [lineUserId]
    )
  ]);

  const today = todayRes.rows[0];
  const monthlyKcal = monthRes.rows[0]?.monthly_kcal || 0;
  const weight = weightRes.rows[0]?.weight_kg ?? null;
  const waist = waistRes.rows[0]?.waist_inch ?? null;
  const latestDate = latestDateRes.rows[0]?.latest_date ?? null;

  return {
    todayEstimatedKcal: today?.today_kcal || 0,
    todayEstimatedKcalMin: today?.today_kcal_min || 0,
    todayEstimatedKcalMax: today?.today_kcal_max || 0,
    todayProtein: today?.today_protein || 0,
    todayProteinGoal: today?.today_protein_goal || 0,
    todayCarbs: today?.today_carbs || 0,
    todayCarbsGoal: today?.today_carbs_goal || 0,
    todayFat: today?.today_fat || 0,
    todayFatGoal: today?.today_fat_goal || 0,
    latestWeight: weight,
    latestWaist: waist,
    averageConfidence: today?.avg_confidence || 0,
    totalMealsToday: today?.total_meals || 0,
    monthlyEstimatedKcal: monthlyKcal,
    latestFoodLogDate: latestDate
  };
}
