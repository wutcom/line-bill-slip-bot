export const dynamic = 'force-dynamic';

import AppShell from '../components/AppShell';
import KpiStrip from '../components/KpiStrip';
import CategoryBars from '../components/CategoryBars';
import TopSpenders from '../components/TopSpenders';
import SpendingChart from '../components/SpendingChart';
import { getCurrentMonthKey } from '../lib/dates';
import { getOverview } from '../lib/queries/overview';
import { getUsers } from '../lib/queries/users';

export default async function OverviewPage({ searchParams }) {
  const params = await searchParams;
  const month = params?.month || getCurrentMonthKey();
  const selectedUserId = params?.userId || '';
  const { users, overview, error } = await loadOverview({ userId: selectedUserId, month });
  const effectiveUserId = selectedUserId || overview.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="overview">
      {error ? <ConnectionNotice message={error} /> : null}
      <KpiStrip overview={overview} />

      <div className="content-grid">
        <SpendingChart rows={overview.dailyTrend} />
        <TopSpenders rows={overview.topShops} latestSync={overview.latestSync} />
      </div>

      <CategoryBars rows={overview.spendingByCategory} />
    </AppShell>
  );
}

async function loadOverview(filters) {
  try {
    const [users, overview] = await Promise.all([
      getUsers(),
      getOverview(filters)
    ]);

    return { users, overview, error: null };
  } catch (error) {
    return {
      users: [],
      overview: {
        userId: null,
        month: filters.month,
        totalExpense: 0,
        todayExpense: 0,
        transactionCount: 0,
        totalBudget: 0,
        remainingBudget: 0,
        spendingByCategory: [],
        topShops: [],
        dailyTrend: [],
        latestSync: null
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
