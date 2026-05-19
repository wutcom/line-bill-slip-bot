import Link from 'next/link';
import { getCurrentMonthKey } from '../lib/dates';

export default function AppShell({ children, users = [], selectedUserId, month, active = 'overview' }) {
  const selectedMonth = month || getCurrentMonthKey();
  const page = getPageMeta(active);
  const navItems = getNavItems(selectedUserId, selectedMonth, active);

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <p className="eyebrow">LINE Bill Slip Bot</p>
          <h1>Expense Dashboard</h1>
        </div>

        <nav className="desktop-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <Link className={item.isActive ? 'active' : ''} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <details className="mobile-menu">
          <summary aria-label="Open navigation menu">
            <span>Menu</span>
            <b aria-hidden="true">☰</b>
          </summary>
          <nav aria-label="Mobile dashboard navigation">
            {navItems.map((item) => (
              <Link className={item.isActive ? 'active' : ''} href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </details>

        <p className="nav-note">Data comes from PostgreSQL after the Google Sheets sync job runs.</p>
        <a className="signout-link" href="/api/auth/signout">Sign out</a>
      </aside>

      <main className="workspace">
        {active === 'help' || active === 'sync' ? null : <form className="toolbar" action={page.action}>
          <div>
            <p className="eyebrow">Current scope</p>
            <h2>{page.title}</h2>
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
        </form>}

        {children}
      </main>
    </div>
  );
}

function getNavItems(selectedUserId, selectedMonth, active) {
  const query = `userId=${selectedUserId || ''}&month=${selectedMonth}`;
  const items = [
    { id: 'overview', label: 'Overview', href: `/?${query}` },
    { id: 'budget', label: 'Budget Plan', href: `/budget?${query}` },
    { id: 'transactions', label: 'Transactions', href: `/transactions?${query}` },
    { id: 'categories', label: 'Categories', href: `/categories?${query}` },
    { id: 'sync', label: 'Sync Monitor', href: '/sync' },
    { id: 'help', label: 'Help', href: '/help' }
  ];

  return items.map((item) => ({
    ...item,
    isActive: item.id === active
  }));
}

function getPageMeta(active) {
  const pages = {
    overview: { title: 'Overview', action: '/' },
    budget: { title: 'Budget Plan', action: '/budget' },
    transactions: { title: 'Transactions', action: '/transactions' },
    categories: { title: 'Categories', action: '/categories' }
  };

  return pages[active] || pages.overview;
}
