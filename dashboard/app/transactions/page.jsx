export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import SyncMonitor from '../../components/SyncMonitor';
import { getSyncMonitor } from '../../lib/queries/sync';

export default async function SyncPage() {
  const { data, error } = await loadSync();

  return (
    <AppShell active="sync">
      {error ? <ConnectionNotice message={error} /> : null}
      <SyncMonitor data={data} />
    </AppShell>
  );
}

async function loadSync() {
  try {
    return {
      data: await getSyncMonitor(),
      error: null
    };
  } catch (error) {
    return {
      data: {
        latest: null,
        runs: [],
        errors: []
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
