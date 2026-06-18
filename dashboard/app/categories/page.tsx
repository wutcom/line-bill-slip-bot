export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import CategoryAnalytics from '../../components/CategoryAnalytics';
import { getCurrentMonthKey } from '../../lib/dates';
import { getCategoryAnalytics, CategoryAnalyticsData } from '../../lib/queries/categories';
import { getUsers, AppUser } from '../../lib/queries/users';

interface CategoriesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const params = await searchParams;
  const month = typeof params?.month === 'string' ? params.month : getCurrentMonthKey();
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const { users, analytics, error } = await loadCategories({ userId: selectedUserId, month });
  const effectiveUserId = selectedUserId || analytics.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="categories">
      {error ? <ConnectionNotice message={error} /> : null}
      <CategoryAnalytics data={analytics} />
    </AppShell>
  );
}

interface LoadCategoriesResult {
  users: AppUser[];
  analytics: CategoryAnalyticsData;
  error: string | null;
}

async function loadCategories(filters: { userId?: string | number | null; month?: string | null }): Promise<LoadCategoriesResult> {
  try {
    const [users, analytics] = await Promise.all([
      getUsers(),
      getCategoryAnalytics(filters)
    ]);

    return { users, analytics, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      users: [],
      analytics: {
        userId: null,
        month: filters.month || getCurrentMonthKey(),
        categories: [],
        monthlyTrend: []
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

