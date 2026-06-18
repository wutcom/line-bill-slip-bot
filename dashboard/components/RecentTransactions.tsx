import { formatMoney } from '../lib/format';

interface Transaction {
  id: number;
  date: string;
  shopName: string;
  amount: number;
  categoryName: string;
  status: string;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export default function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <section className="section-block recent-transactions-block">
      <div className="section-heading">
        <h3>Recent Transactions</h3>
        <p>Latest confirmed expenses recorded in PostgreSQL.</p>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Destination</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-table-cell">No transactions found for this period.</td>
              </tr>
            ) : null}
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="date-cell">{tx.date || '-'}</td>
                <td>
                  <strong>{tx.shopName}</strong>
                </td>
                <td>
                  <span className="category-pill">{tx.categoryName}</span>
                </td>
                <td className="amount-cell">
                  <strong>{formatMoney(tx.amount)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
