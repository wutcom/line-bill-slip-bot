export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import BudgetPlanList from '../../components/BudgetPlanList';
import { getCurrentMonthKey } from '../../lib/dates';
import { getBudgetPlans } from '../../lib/queries/budget';
import { getUsers } from '../../lib/queries/users';

export default async function BudgetPage({ searchParams }) {
  const params = await searchParams;
  const month = params?.month || getCurrentMonthKey();
  const selectedUserId = params?.userId || '';
  const { users, budget, error } = await loadBudget({ userId: selectedUserId, month });
  const effectiveUserId = selectedUserId || budget.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="budget">
      {error ? <ConnectionNotice message={error} /> : null}

      <section className="section-intro">
        <h3>Plan status</h3>
        <p>Budget progress is calculated from confirmed PostgreSQL transactions for the selected month.</p>
      </section>

      <BudgetPlanList plans={budget.plans} />
    </AppShell>
  );
}

async function loadBudget(filters) {
  try {
    const [users, budget] = await Promise.all([
      getUsers(),
      getBudgetPlans(filters)
    ]);

    return { users, budget, error: null };
  } catch (error) {
    return {
      users: [],
      budget: {
        userId: null,
        month: filters.month,
        plans: []
      },
      error: error.message
    };
  }
}

function ConnectionNotice({ message }) {
  return (
    <section className="notice">
      <strong>PostgreSQL connection needed</strong>
      <p>{message}</p>
    </section>
  );
}
