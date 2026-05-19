export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import CategoryAnalytics from '../../components/CategoryAnalytics';
import { getCurrentMonthKey } from '../../lib/dates';
import { getCategoryAnalytics } from '../../lib/queries/categories';
import { getUsers } from '../../lib/queries/users';

export default async function CategoriesPage({ searchParams }) {
  const params = await searchParams;
  const month = params?.month || getCurrentMonthKey();
  const selectedUserId = params?.userId || '';
  const { users, analytics, error } = await loadCategories({ userId: selectedUserId, month });
  const effectiveUserId = selectedUserId || analytics.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="categories">
      {error ? <ConnectionNotice message={error} /> : null}
      <CategoryAnalytics data={analytics} />
    </AppShell>
  );
}

async function loadCategories(filters) {
  try {
    const [users, analytics] = await Promise.all([
      getUsers(),
      getCategoryAnalytics(filters)
    ]);

    return { users, analytics, error: null };
  } catch (error) {
    return {
      users: [],
      analytics: {
        userId: null,
        month: filters.month,
        categories: [],
        monthlyTrend: []
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
