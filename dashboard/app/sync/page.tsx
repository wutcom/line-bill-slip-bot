export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import SyncMonitor from '../../components/SyncMonitor';
import { getSyncMonitor, SyncMonitorData } from '../../lib/queries/sync';

interface LoadSyncResult {
  data: SyncMonitorData;
  error: string | null;
}

export default async function SyncPage() {
  const { data, error } = await loadSync();

  return (
    <AppShell active="sync">
      {error ? <ConnectionNotice message={error} /> : null}
      <SyncMonitor data={data} />
    </AppShell>
  );
}

async function loadSync(): Promise<LoadSyncResult> {
  try {
    return {
      data: await getSyncMonitor(),
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {
        latest: null,
        runs: [],
        errors: []
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

