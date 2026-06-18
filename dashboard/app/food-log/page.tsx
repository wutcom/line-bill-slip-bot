export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import FoodLogDashboard from '../../components/FoodLogDashboard';
import { getUsers } from '../../lib/queries/users';

interface FoodLogPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FoodLogPage({ searchParams }: FoodLogPageProps) {
  const params = await searchParams;
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const users = await getUsers();
  
  const defaultUser = users[0];
  const effectiveUserId = selectedUserId || String(defaultUser?.id || '');

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} active="food-log">
      <FoodLogDashboard 
        users={users.map(u => ({ id: Number(u.id), line_user_id: u.line_user_id, display_name: u.display_name }))} 
        selectedUserId={String(effectiveUserId)} 
      />
    </AppShell>
  );
}
