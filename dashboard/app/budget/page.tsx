export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import BudgetPlanList from '../../components/BudgetPlanList';
import { getCurrentPlanMonthKey } from '../../lib/dates';
import { getBudgetPlans, BudgetPlansData } from '../../lib/queries/budget';
import { getUsers, AppUser } from '../../lib/queries/users';

interface BudgetPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const params = await searchParams;
  const monthParam = typeof params?.month === 'string' ? params.month : null;
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const { users, budget, error } = await loadBudget({ userId: selectedUserId, month: monthParam });
  const effectiveUserId = selectedUserId || budget.userId || users[0]?.id || '';
  const month = budget.month;

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="budget">
      {error ? <ConnectionNotice message={error} /> : null}

      <section className="section-intro">
        <h3>Plan status</h3>
        <p>Budget progress is calculated from recorded plan payments for the selected plan month.</p>
      </section>

      <BudgetPlanList plans={budget.plans} />
    </AppShell>
  );
}

interface LoadBudgetResult {
  users: AppUser[];
  budget: BudgetPlansData;
  error: string | null;
}

async function loadBudget(filters: { userId?: string | number | null; month?: string | null }): Promise<LoadBudgetResult> {
  try {
    const [users, budget] = await Promise.all([
      getUsers(),
      getBudgetPlans(filters)
    ]);

    return { users, budget, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      users: [],
      budget: {
        userId: null,
        month: filters.month || getCurrentPlanMonthKey(),
        plans: []
      },
      error: message
    };
  }
}

function ConnectionNotice({ message }: { message: string }) {
  return (
    <section className="notice">
      <strong>PostgreSQL connection needed</strong>
      <p>{message}</p>
    </section>
  );
}

