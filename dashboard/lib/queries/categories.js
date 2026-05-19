const { query } = require('../db');
const { getCurrentMonthKey, getMonthBounds } = require('../dates');
const { resolveUserId } = require('./users');

async function getCategoryAnalytics({ userId, month } = {}) {
  const resolvedUserId = await resolveUserId(userId);
  const bounds = getMonthBounds(month || getCurrentMonthKey());

  if (!resolvedUserId) {
    return {
      userId: null,
      month: bounds.monthKey,
      categories: [],
      monthlyTrend: []
    };
  }

  const categoryResult = await query(
    `SELECT
       COALESCE(c.code, lower(t.category_text), 'other') AS category_code,
       COALESCE(c.name, t.category_text, 'Other') AS category_name,
       COALESCE(SUM(t.amount), 0) AS total_amount,
       COUNT(*)::int AS transaction_count,
       COALESCE(AVG(t.amount), 0) AS average_amount
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1
       AND t.transaction_date >= $2
       AND t.transaction_date < $3
       AND t.status = 'confirmed'
       AND t.expense_type = 'expense'
     GROUP BY COALESCE(c.code, lower(t.category_text), 'other'), COALESCE(c.name, t.category_text, 'Other')
     ORDER BY total_amount DESC`,
    [resolvedUserId, bounds.monthStart, bounds.nextMonthStart]
  );

  const trendResult = await query(
    `SELECT
       to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') AS month,
       COALESCE(c.name, t.category_text, 'Other') AS category_name,
       COALESCE(SUM(t.amount), 0) AS total_amount
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1
       AND t.transaction_date >= ($2::date - interval '5 months')
       AND t.transaction_date < $3
       AND t.status = 'confirmed'
       AND t.expense_type = 'expense'
     GROUP BY date_trunc('month', t.transaction_date), COALESCE(c.name, t.category_text, 'Other')
     ORDER BY month, total_amount DESC`,
    [resolvedUserId, bounds.monthStart, bounds.nextMonthStart]
  );

  return {
    userId: resolvedUserId,
    month: bounds.monthKey,
    categories: categoryResult.rows.map((row) => ({
      categoryCode: row.category_code,
      categoryName: row.category_name,
      totalAmount: Number(row.total_amount || 0),
      transactionCount: Number(row.transaction_count || 0),
      averageAmount: Number(row.average_amount || 0)
    })),
    monthlyTrend: trendResult.rows.map((row) => ({
      month: row.month,
      categoryName: row.category_name,
      totalAmount: Number(row.total_amount || 0)
    }))
  };
}

module.exports = {
  getCategoryAnalytics
};
