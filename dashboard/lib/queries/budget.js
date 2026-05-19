const { query } = require('../db');
const { getCurrentMonthKey, getMonthBounds } = require('../dates');
const { resolveUserId } = require('./users');

async function getBudgetPlans({ userId, month } = {}) {
  const resolvedUserId = await resolveUserId(userId);
  const bounds = getMonthBounds(month || getCurrentMonthKey());

  if (!resolvedUserId) {
    return {
      userId: null,
      month: bounds.monthKey,
      plans: []
    };
  }

  const result = await query(
    `SELECT
       bp.id,
       bp.plan_name,
       bp.plan_amount,
       bp.status,
       COALESCE(c.name, 'Unmapped') AS category_name,
       COALESCE(SUM(t.amount), 0) AS spent_amount
     FROM budget_plans bp
     LEFT JOIN categories c
       ON c.id = bp.category_id
     LEFT JOIN transactions t
       ON t.user_id = bp.user_id
      AND t.transaction_date >= $3
      AND t.transaction_date < $4
      AND t.status = 'confirmed'
      AND t.expense_type = 'expense'
      AND (
        (bp.category_id IS NOT NULL AND t.category_id = bp.category_id)
        OR (
          bp.category_id IS NULL
          AND lower(
            COALESCE(t.shop_or_bank_name, '') || ' ' ||
            COALESCE(t.description, '') || ' ' ||
            COALESCE(t.raw_text, '')
          ) LIKE '%' || lower(bp.plan_name) || '%'
        )
      )
     WHERE bp.user_id = $1
       AND bp.plan_month = $2
       AND bp.status IN ('active', 'paid')
     GROUP BY bp.id, bp.plan_name, bp.plan_amount, bp.status, c.name
     ORDER BY bp.plan_name`,
    [resolvedUserId, bounds.monthStart, bounds.monthStart, bounds.nextMonthStart]
  );

  const plans = result.rows.map((row) => {
    const planAmount = Number(row.plan_amount || 0);
    const spentAmount = Number(row.spent_amount || 0);
    const remainingAmount = planAmount - spentAmount;
    const progressPercent = planAmount > 0
      ? Math.min((spentAmount / planAmount) * 100, 999)
      : 0;

    return {
      id: row.id,
      planName: row.plan_name,
      categoryName: row.category_name,
      planAmount,
      spentAmount,
      remainingAmount,
      progressPercent,
      status: remainingAmount <= 0 ? 'over' : row.status
    };
  });

  return {
    userId: resolvedUserId,
    month: bounds.monthKey,
    plans
  };
}

module.exports = {
  getBudgetPlans
};
