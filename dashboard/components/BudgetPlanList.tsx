import { formatMoney, formatPercent } from '../lib/format';
import { BudgetPlan } from '../lib/queries/budget';

interface BudgetPlanListProps {
  plans?: BudgetPlan[];
}

export default function BudgetPlanList({ plans = [] }: BudgetPlanListProps) {
  const totalPlan = plans.reduce((sum, plan) => sum + plan.planAmount, 0);
  const totalPaid = plans.reduce((sum, plan) => sum + (plan.paidAmount ?? plan.spentAmount), 0);
  const totalRemaining = totalPlan - totalPaid;

  return (
    <section className="budget-workspace">
      <div className="budget-summary">
        <div>
          <span>Total plan</span>
          <strong>{formatMoney(totalPlan)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong>{formatMoney(totalPaid)}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong className={totalRemaining < 0 ? 'danger-text' : ''}>{formatMoney(totalRemaining)}</strong>
        </div>
      </div>

      <div className="plan-list">
        {plans.length === 0 ? <p className="empty-line">No active budget plans for this month.</p> : null}
        {plans.map((plan) => (
          <article className="plan-row" key={plan.id}>
            <div className="plan-main">
              <div>
                <h3>{plan.planName}</h3>
                <p>{plan.categoryName} · {plan.paymentCount || 0} payments</p>
              </div>
              <strong>{formatMoney(plan.planAmount)}</strong>
            </div>

            <div className="plan-progress">
              <div className="progress-track">
                <div
                  className={plan.remainingAmount < 0 ? 'over' : ''}
                  style={{ width: `${Math.min(plan.progressPercent, 100)}%` }}
                />
              </div>
              <span>{formatPercent(plan.progressPercent)}</span>
            </div>

            <div className="plan-metrics">
              <span>Paid {formatMoney(plan.paidAmount ?? plan.spentAmount)}</span>
              <span className={plan.remainingAmount < 0 ? 'danger-text' : ''}>
                Remaining {formatMoney(plan.remainingAmount)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

