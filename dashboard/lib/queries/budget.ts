import { query } from '../db';
import { getCurrentPlanMonthKey, getMonthBounds } from '../dates';
import { resolveUserId } from './users';

export interface BudgetPlan {
  id: number;
  planName: string;
  categoryName: string;
  planAmount: number;
  spentAmount: number;
  paidAmount: number;
  paymentCount: number;
  remainingAmount: number;
  progressPercent: number;
  status: string;
}

export interface BudgetPlansData {
  userId: number | null;
  month: string;
  plans: BudgetPlan[];
}

export async function getBudgetPlans({ userId, month }: { userId?: string | number | null; month?: string | null } = {}): Promise<BudgetPlansData> {
  const resolvedUserId = await resolveUserId(userId);
  const bounds = getMonthBounds(month || getCurrentPlanMonthKey());

  if (!resolvedUserId) {
    return {
      userId: null,
      month: bounds.monthKey,
      plans: []
    };
  }

  const result = await query<{
    id: number;
    plan_name: string;
    plan_amount: string | number;
    status: string;
    category_name: string;
    paid_amount: string | number;
    payment_count: string | number;
  }>(
    `SELECT
       bp.id,
       bp.plan_name,
       bp.plan_amount,
       bp.status,
       COALESCE(c.name, 'Unmapped') AS category_name,
       COALESCE(SUM(bpmt.amount) FILTER (WHERE bpmt.status = 'active'), 0) AS paid_amount,
       COUNT(bpmt.id) FILTER (WHERE bpmt.status = 'active') AS payment_count
     FROM budget_plans bp
     LEFT JOIN categories c
       ON c.id = bp.category_id
     LEFT JOIN budget_payments bpmt
       ON bpmt.user_id = bp.user_id
      AND bpmt.plan_month = bp.plan_month
      AND bpmt.plan_name = bp.plan_name
     WHERE bp.user_id = $1
       AND bp.plan_month = $2::date
       AND bp.status IN ('active', 'paid')
     GROUP BY bp.id, bp.plan_name, bp.plan_amount, bp.status, c.name
     ORDER BY bp.plan_name`,
    [resolvedUserId, bounds.monthStart]
  );

  const plans = result.rows.map((row) => {
    const planAmount = Number(row.plan_amount || 0);
    const paidAmount = Number(row.paid_amount || 0);
    const remainingAmount = planAmount - paidAmount;
    const progressPercent = planAmount > 0
      ? Math.min((paidAmount / planAmount) * 100, 999)
      : 0;

    return {
      id: row.id,
      planName: row.plan_name,
      categoryName: row.category_name,
      planAmount,
      spentAmount: paidAmount,
      paidAmount,
      paymentCount: Number(row.payment_count || 0),
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

