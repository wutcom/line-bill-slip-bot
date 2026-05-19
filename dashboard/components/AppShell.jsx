import Link from 'next/link';
import { getCurrentMonthKey } from '../lib/dates';

export default function AppShell({ children, users = [], selectedUserId, month, active = 'overview' }) {
  const selectedMonth = month || getCurrentMonthKey();

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div>
          <p className="eyebrow">LINE Bill Slip Bot</p>
          <h1>Expense Dashboard</h1>
        </div>

        <nav aria-label="Dashboard navigation">
          <Link className={active === 'overview' ? 'active' : ''} href={`/?userId=${selectedUserId || ''}&month=${selectedMonth}`}>
            Overview
          </Link>
          <Link className={active === 'budget' ? 'active' : ''} href={`/budget?userId=${selectedUserId || ''}&month=${selectedMonth}`}>
            Budget Plan
          </Link>
        </nav>

        <p className="nav-note">Data comes from PostgreSQL after the Google Sheets sync job runs.</p>
      </aside>

      <main className="workspace">
        <form className="toolbar" action={active === 'budget' ? '/budget' : '/'}>
          <div>
            <p className="eyebrow">Current scope</p>
            <h2>{active === 'budget' ? 'Budget Plan' : 'Overview'}</h2>
          </div>

          <div className="filters">
            <label>
              <span>User</span>
              <select name="userId" defaultValue={selectedUserId || ''}>
                {users.length === 0 ? <option value="">No users</option> : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Month</span>
              <input type="month" name="month" defaultValue={selectedMonth} />
            </label>

            <button type="submit">Apply</button>
          </div>
        </form>

        {children}
      </main>
    </div>
  );
}
