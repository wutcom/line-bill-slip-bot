export const dynamic = 'force-dynamic';

import AppShell from '../../components/AppShell';
import TransactionFilters from '../../components/TransactionFilters';
import TransactionsTable from '../../components/TransactionsTable';
import { getCurrentMonthKey } from '../../lib/dates';
import { getTransactions, TransactionsData, TransactionFilters as ITransactionFilters } from '../../lib/queries/transactions';
import { getUsers, AppUser } from '../../lib/queries/users';

interface TransactionsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams;

  const getSingleStringParam = (param: string | string[] | undefined): string => {
    if (typeof param === 'string') return param;
    if (Array.isArray(param)) return param[0] || '';
    return '';
  };

  const filters: ITransactionFilters = {
    userId: getSingleStringParam(params?.userId),
    month: getSingleStringParam(params?.month) || getCurrentMonthKey(),
    category: getSingleStringParam(params?.category),
    status: getSingleStringParam(params?.status),
    search: getSingleStringParam(params?.search),
    page: getSingleStringParam(params?.page) || '1'
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

interface LoadTransactionsResult {
  users: AppUser[];
  transactions: TransactionsData;
  error: string | null;
}

async function loadTransactions(filters: ITransactionFilters): Promise<LoadTransactionsResult> {
  try {
    const [users, transactions] = await Promise.all([
      getUsers(),
      getTransactions(filters)
    ]);

    return { users, transactions, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      users: [],
      transactions: {
        userId: null,
        month: filters.month || getCurrentMonthKey(),
        page: 1,
        pageSize: 25,
        total: 0,
        rows: []
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

