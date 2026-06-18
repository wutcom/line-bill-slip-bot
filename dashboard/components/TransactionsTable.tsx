import { ReactNode } from 'react';
import { formatMoney } from '../lib/format';
import { TransactionsData, TransactionFilters } from '../lib/queries/transactions';

interface TransactionsTableProps {
  data: TransactionsData;
  filters: TransactionFilters;
}

export default function TransactionsTable({ data, filters }: TransactionsTableProps) {
  const totalPages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const exportHref = buildExportHref(filters);

  return (
    <section className="section-block table-section">
      <div className="section-heading">
        <div>
          <h3>Transaction list</h3>
          <p>{data.total} rows for the selected filters.</p>
        </div>
        <a className="action-link" href={exportHref}>Export CSV</a>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Shop / Bank</th>
              <th>Category</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No transactions found.</td>
              </tr>
            ) : null}
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.transactionDate || '-'}</td>
                <td>
                  <strong>{row.shopOrBankName}</strong>
                  <small>{row.referenceNo || row.description || row.documentType}</small>
                </td>
                <td>{row.categoryName}</td>
                <td><StatusPill status={row.status} /></td>
                <td className="amount-cell">{formatMoney(row.amount)}</td>
                <td>
                  {row.imageUrl ? <a className="text-link" href={row.imageUrl} target="_blank" rel="noreferrer">Open</a> : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <span>Page {data.page} of {totalPages}</span>
        <div>
          <PageLink disabled={data.page <= 1} page={data.page - 1} filters={filters}>Previous</PageLink>
          <PageLink disabled={data.page >= totalPages} page={data.page + 1} filters={filters}>Next</PageLink>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{status}</span>;
}

interface PageLinkProps {
  children: ReactNode;
  disabled: boolean;
  page: number;
  filters: TransactionFilters;
}

function PageLink({ children, disabled, page, filters }: PageLinkProps) {
  if (disabled) {
    return <span className="page-link disabled">{children}</span>;
  }

  return <a className="page-link" href={buildPageHref(filters, page)}>{children}</a>;
}

function buildPageHref(filters: TransactionFilters, page: number): string {
  const params = new URLSearchParams();
  Object.entries({ ...filters, page }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return `/transactions?${params.toString()}`;
}

function buildExportHref(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return `/api/transactions/export?${params.toString()}`;
}

