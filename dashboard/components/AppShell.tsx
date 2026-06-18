import { ReactNode } from 'react';
import Link from 'next/link';
import { getCurrentMonthKey } from '../lib/dates';
import { AppUser } from '../lib/queries/users';

interface AppShellProps {
  children?: ReactNode;
  users?: AppUser[];
  selectedUserId?: string | number | null;
  month?: string | null;
  active?: string;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  isExternal?: boolean;
  isActive?: boolean;
}

export default function AppShell({ children, users = [], selectedUserId, month, active = 'overview' }: AppShellProps) {
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
            <NavLink item={item} key={item.href} />
          ))}
        </nav>

        <details className="mobile-menu">
          <summary aria-label="Open navigation menu">
            <span>Menu</span>
            <b aria-hidden="true">☰</b>
          </summary>
          <nav aria-label="Mobile dashboard navigation">
            {navItems.map((item) => (
              <NavLink item={item} key={item.href} />
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

function NavLink({ item }: { item: NavItem }) {
  const className = item.isActive ? 'active' : '';

  if (item.isExternal) {
    return (
      <a className={className} href={item.href}>
        {item.label}
      </a>
    );
  }

  return (
    <Link className={className} href={item.href}>
      {item.label}
    </Link>
  );
}

function getNavItems(selectedUserId: string | number | undefined | null, selectedMonth: string, active: string): NavItem[] {
  const query = `userId=${selectedUserId || ''}&month=${selectedMonth}`;
  const helpHref = getHelpHref();
  const items: NavItem[] = [
    { id: 'overview', label: 'Overview', href: `/?${query}` },
    { id: 'budget', label: 'Budget Plan', href: `/budget?${query}` },
    { id: 'transactions', label: 'Transactions', href: `/transactions?${query}` },
    { id: 'categories', label: 'Categories', href: `/categories?${query}` },
    { id: 'sync', label: 'Sync Monitor', href: '/sync' },
    { id: 'help', label: 'Help', href: helpHref, isExternal: isAbsoluteUrl(helpHref) }
  ];

  return items.map((item) => ({
    ...item,
    isActive: item.id === active
  }));
}

function getHelpHref(): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_HELP_URL
    || process.env.NEXT_PUBLIC_DASHBOARD_URL
    || process.env.NEXTAUTH_URL
    || process.env.DASHBOARD_URL
    || '';

  if (!dashboardUrl) return '/help';

  return `${dashboardUrl.replace(/\/$/, '')}/help`;
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

interface PageMeta {
  title: string;
  action: string;
}

function getPageMeta(active: string): PageMeta {
  const pages: Record<string, PageMeta> = {
    overview: { title: 'Overview', action: '/' },
    budget: { title: 'Budget Plan', action: '/budget' },
    transactions: { title: 'Transactions', action: '/transactions' },
    categories: { title: 'Categories', action: '/categories' }
  };

  return pages[active] || pages.overview;
}