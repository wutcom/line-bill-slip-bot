export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import BodyMetrics from '../../components/BodyMetrics';
import { getBodyMetrics, BodyMetricsData } from '../../lib/queries/bodyMetrics';
import { getUsers, AppUser } from '../../lib/queries/users';

interface BodyMetricsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BodyMetricsPage({ searchParams }: BodyMetricsPageProps) {
  const params = await searchParams;
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const { users, data, error } = await loadBodyMetrics({ userId: selectedUserId });
  const effectiveUserId = selectedUserId || data.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} active="body-metrics">
      {error ? <ConnectionNotice message={error} /> : null}
      <BodyMetrics data={data} />
    </AppShell>
  );
}

interface LoadResult {
  users: AppUser[];
  data: BodyMetricsData;
  error: string | null;
}

async function loadBodyMetrics(filters: { userId?: string | number | null }): Promise<LoadResult> {
  try {
    const [users, data] = await Promise.all([
      getUsers(),
      getBodyMetrics(filters)
    ]);

    return { users, data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      users: [],
      data: { userId: null, latest: null, previous: null, history: [] },
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
