export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import TransactionFilters from '../../components/TransactionFilters';
import TransactionsTable from '../../components/TransactionsTable';
import { getCurrentMonthKey } from '../../lib/dates';
import { getTransactions } from '../../lib/queries/transactions';
import { getUsers } from '../../lib/queries/users';

export default async function TransactionsPage({ searchParams }) {
  const params = await searchParams;
  const filters = {
    userId: params?.userId || '',
    month: params?.month || getCurrentMonthKey(),
    category: params?.category || '',
    status: params?.status || '',
    search: params?.search || '',
    page: params?.page || '1'
  };
  const { users, transactions, error } = await loadTransactions(filters);
  const effectiveUserId = filters.userId || transactions.userId || users[0]?.id || '';

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={filters.month} active="transactions">
      {error ? <ConnectionNotice message={error} /> : null}
      <TransactionFilters filters={{ ...filters, userId: effectiveUserId }} />
      <TransactionsTable data={transactions} filters={{ ...filters, userId: effectiveUserId }} />
    </AppShell>
  );
}

async function loadTransactions(filters) {
  try {
    const [users, transactions] = await Promise.all([
      getUsers(),
      getTransactions(filters)
    ]);

    return { users, transactions, error: null };
  } catch (error) {
    return {
      users: [],
      transactions: {
        userId: null,
        month: filters.month,
        page: 1,
        pageSize: 25,
        total: 0,
        rows: []
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
