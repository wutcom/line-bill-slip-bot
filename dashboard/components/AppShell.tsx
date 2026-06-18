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
  icon: string;
  isExternal?: boolean;
  isActive?: boolean;
}

export default function AppShell({ children, users = [], selectedUserId, month, active = 'overview' }: AppShellProps) {
  const selectedMonth = month || getCurrentMonthKey();
  const page = getPageMeta(active);
  const navItems = getNavItems(selectedUserId, selectedMonth, active);

  return (
    <div className="app-shell">
      {/* Mobile Top Header */}
      <header className="mobile-top-header">
        <div className="mobile-brand">
          <span className="mobile-brand-icon">🌱</span>
          <h1>MindLife</h1>
        </div>
        <a className="mobile-signout" href="/api/auth/signout" title="Sign Out">🚪</a>
      </header>

      {/* Desktop Sidebar Nav */}
      <aside className="side-nav">
        <div className="brand-block">
          <p className="eyebrow">Personal Balance Dashboard</p>
          <h1>MindLife</h1>
        </div>

        <nav className="desktop-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <NavLink item={item} key={item.href} />
          ))}
        </nav>

        <p className="nav-note">Data comes from PostgreSQL after the Google Sheets sync job runs.</p>
        <a className="signout-link" href="/api/auth/signout">Sign out</a>
      </aside>

      {/* Main Workspace */}
      <main className="workspace">
        {active === 'help' || active === 'sync' || active === 'body-metrics' || active === 'food-log' || active === 'running' ? null : (
          <form className="toolbar" action={page.action}>
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
          </form>
        )}

        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <Link href={`/?userId=${selectedUserId || ''}&month=${selectedMonth}`} className={active === 'overview' ? 'active' : ''}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Overview</span>
        </Link>
        <Link href={`/budget?userId=${selectedUserId || ''}&month=${selectedMonth}`} className={active === 'budget' ? 'active' : ''}>
          <span className="nav-icon">🎯</span>
          <span className="nav-label">Budget</span>
        </Link>
        <Link href={`/transactions?userId=${selectedUserId || ''}&month=${selectedMonth}`} className={active === 'transactions' ? 'active' : ''}>
          <span className="nav-icon">💳</span>
          <span className="nav-label">Txns</span>
        </Link>
        <Link href={`/categories?userId=${selectedUserId || ''}&month=${selectedMonth}`} className={active === 'categories' ? 'active' : ''}>
          <span className="nav-icon">📂</span>
          <span className="nav-label">Categories</span>
        </Link>
        <details className="mobile-more-details">
          <summary className="bottom-nav-item">
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">More</span>
          </summary>
          <div className="mobile-more-menu-popup">
            <div className="popup-header">More Options</div>
            <Link href={`/body-metrics?userId=${selectedUserId || ''}`}>
              <span>⚖️</span> Body Metrics
            </Link>
            <Link href="/sync">
              <span>🔄</span> Sync Monitor
            </Link>
            <Link href="/help">
              <span>❓</span> Help Guide
            </Link>
            <a href="/api/auth/signout" className="popup-signout">
              <span>🚪</span> Sign Out
            </a>
          </div>
        </details>
      </nav>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const className = item.isActive ? 'active' : '';

  if (item.isExternal) {
    return (
      <a className={className} href={item.href}>
        <span className="nav-item-icon">{item.icon}</span> {item.label}
      </a>
    );
  }

  return (
    <Link className={className} href={item.href}>
      <span className="nav-item-icon">{item.icon}</span> {item.label}
    </Link>
  );
}

function getNavItems(selectedUserId: string | number | undefined | null, selectedMonth: string, active: string): NavItem[] {
  const query = `userId=${selectedUserId || ''}&month=${selectedMonth}`;
  const helpHref = getHelpHref();
  const items: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: '📊', href: `/?${query}` },
    { id: 'budget', label: 'Budget Plan', icon: '🎯', href: `/budget?${query}` },
    { id: 'transactions', label: 'Transactions', icon: '💳', href: `/transactions?${query}` },
    { id: 'categories', label: 'Categories', icon: '📂', href: `/categories?${query}` },
    { id: 'body-metrics', label: 'Body Metrics', icon: '⚖️', href: `/body-metrics?userId=${selectedUserId || ''}` },
    { id: 'food-log', label: 'Food Log', icon: '🥗', href: `/food-log?userId=${selectedUserId || ''}` },
    { id: 'running', label: 'Running', icon: '🏃', href: `/running?userId=${selectedUserId || ''}` },
    { id: 'sync', label: 'Sync Monitor', icon: '🔄', href: '/sync' },
    { id: 'help', label: 'Help', icon: '❓', href: helpHref, isExternal: isAbsoluteUrl(helpHref) }
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