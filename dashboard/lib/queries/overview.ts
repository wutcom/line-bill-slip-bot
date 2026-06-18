import { query } from '../db';
import { getCurrentMonthKey, getMonthBounds } from '../dates';
import { resolveUserId } from './users';

export interface OverviewData {
  userId: number | null;
  month: string;
  totalExpense: number;
  todayExpense: number;
  transactionCount: number;
  totalBudget: number;
  remainingBudget: number;
  spendingByCategory: Array<{
    categoryName: string;
    totalAmount: number;
  }>;
  topShops: Array<{
    shopName: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    totalAmount: number;
  }>;
  latestSync: {
    status: string;
    finished_at: Date | string | null;
    rows_read: number;
    rows_inserted: number;
    rows_updated: number;
    error_message: string | null;
  } | null;
}

export async function getOverview({ userId, month }: { userId?: string | number | null; month?: string | null } = {}): Promise<OverviewData> {
  const resolvedUserId = await resolveUserId(userId);
  const bounds = getMonthBounds(month || getCurrentMonthKey());

  if (!resolvedUserId) {
    return emptyOverview(bounds.monthKey);
  }

  const params = [resolvedUserId, bounds.monthStart, bounds.nextMonthStart];

  const [summary, categories, topShops, trend, syncRun] = await Promise.all([
    query<{ total_expense: string | number; transaction_count: number; today_expense: string | number }>(
      `SELECT
         COALESCE(SUM(amount), 0) AS total_expense,
         COUNT(*)::int AS transaction_count,
         COALESCE(SUM(amount) FILTER (WHERE transaction_date = CURRENT_DATE), 0) AS today_expense
       FROM transactions
       WHERE user_id = $1
         AND transaction_date >= $2
         AND transaction_date < $3
         AND status = 'confirmed'
         AND expense_type = 'expense'`,
      params
    ),
    query<{ category_name: string; total_amount: string | number }>(
      `SELECT COALESCE(c.name, t.category_text, 'Other') AS category_name,
              COALESCE(SUM(t.amount), 0) AS total_amount
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1
         AND t.transaction_date >= $2
         AND t.transaction_date < $3
         AND t.status = 'confirmed'
         AND t.expense_type = 'expense'
       GROUP BY COALESCE(c.name, t.category_text, 'Other')
       ORDER BY total_amount DESC
       LIMIT 8`,
      params
    ),
    query<{ shop_name: string; total_amount: string | number; transaction_count: number }>(
      `SELECT COALESCE(shop_or_bank_name, '-') AS shop_name,
              COALESCE(SUM(amount), 0) AS total_amount,
              COUNT(*)::int AS transaction_count
       FROM transactions
       WHERE user_id = $1
         AND transaction_date >= $2
         AND transaction_date < $3
         AND status = 'confirmed'
         AND expense_type = 'expense'
       GROUP BY COALESCE(shop_or_bank_name, '-')
       ORDER BY total_amount DESC
       LIMIT 5`,
      params
    ),
    query<{ date: string; total_amount: string | number }>(
      `SELECT transaction_date::text AS date,
              COALESCE(SUM(amount), 0) AS total_amount
       FROM transactions
       WHERE user_id = $1
         AND transaction_date >= $2
         AND transaction_date < $3
         AND status = 'confirmed'
         AND expense_type = 'expense'
       GROUP BY transaction_date
       ORDER BY transaction_date`,
      params
    ),
    query<{ status: string; finished_at: Date | string | null; rows_read: number; rows_inserted: number; rows_updated: number; error_message: string | null }>(
      `SELECT status, finished_at, rows_read, rows_inserted, rows_updated, error_message
       FROM sync_runs
       ORDER BY started_at DESC
       LIMIT 1`
    )
  ]);

  const budgetResult = await query<{ total_budget: string | number }>(
    `SELECT COALESCE(SUM(plan_amount), 0) AS total_budget
     FROM budget_plans
     WHERE user_id = $1
       AND plan_month = $2
       AND status = 'active'`,
    [resolvedUserId, bounds.monthStart]
  );

  const totalExpense = Number(summary.rows[0]?.total_expense || 0);
  const totalBudget = Number(budgetResult.rows[0]?.total_budget || 0);

  return {
    userId: resolvedUserId,
    month: bounds.monthKey,
    totalExpense,
    todayExpense: Number(summary.rows[0]?.today_expense || 0),
    transactionCount: Number(summary.rows[0]?.transaction_count || 0),
    totalBudget,
    remainingBudget: totalBudget - totalExpense,
    spendingByCategory: categories.rows.map((row) => ({
      categoryName: row.category_name,
      totalAmount: Number(row.total_amount || 0)
    })),
    topShops: topShops.rows.map((row) => ({
      shopName: row.shop_name,
      totalAmount: Number(row.total_amount || 0),
      transactionCount: Number(row.transaction_count || 0)
    })),
    dailyTrend: trend.rows.map((row) => ({
      date: row.date,
      totalAmount: Number(row.total_amount || 0)
    })),
    latestSync: syncRun.rows[0] || null
  };
}

function emptyOverview(month: string): OverviewData {
  return {
    userId: null,
    month,
    totalExpense: 0,
    todayExpense: 0,
    transactionCount: 0,
    totalBudget: 0,
    remainingBudget: 0,
    spendingByCategory: [],
    topShops: [],
    dailyTrend: [],
    latestSync: null
  };
}

