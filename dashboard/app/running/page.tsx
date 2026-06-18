export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import { getUsers } from '../../lib/queries/users';

interface RunningPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RunningPage({ searchParams }: RunningPageProps) {
  const params = await searchParams;
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const users = await getUsers();
  
  const defaultUser = users[0];
  const effectiveUserId = selectedUserId || String(defaultUser?.id || '');

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} active="running">
      <section className="section-block" style={{ padding: '40px', textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px' }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🏃</span>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px' }}>Running Log</h2>
        <p style={{ color: 'var(--muted)', fontSize: '15px', maxWidth: '480px', margin: '0 auto' }}>
          The Running Log feature is coming soon! Soon you will be able to synchronize track workouts, speed runs, and cardio logs from your Google Sheets directly to PostgreSQL database.
        </p>
      </section>
    </AppShell>
  );
}
