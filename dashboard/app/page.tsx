export const dynamic = 'force-dynamic';

import AppShell from '../components/AppShell';
import KpiStrip from '../components/KpiStrip';
import CategoryBars from '../components/CategoryBars';
import TopSpenders from '../components/TopSpenders';
import SpendingChart from '../components/SpendingChart';
import DashboardActions from '../components/DashboardActions';
import RecentTransactions from '../components/RecentTransactions';
import SyncStatusCard from '../components/SyncStatusCard';
import { getCurrentMonthKey } from '../lib/dates';
import { getOverview, OverviewData } from '../lib/queries/overview';
import { getUsers, AppUser } from '../lib/queries/users';
import { getFoodLogSummary } from '../lib/queries/foodLog';
import FoodSummaryCard from '../components/FoodSummaryCard';

interface OverviewPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const params = await searchParams;
  const month = typeof params?.month === 'string' ? params.month : getCurrentMonthKey();
  const selectedUserId = typeof params?.userId === 'string' ? params.userId : '';
  const { users, overview, foodSummary, error } = await loadOverview({ userId: selectedUserId, month });
  const effectiveUserId = selectedUserId || overview.userId || users[0]?.id || '';

  // Get string version of userId for actions preset
  const stringUserId = String(effectiveUserId);

  return (
    <AppShell users={users} selectedUserId={effectiveUserId} month={month} active="overview">
      {error ? <ConnectionNotice message={error} /> : null}
      
      {/* Primary Action Buttons */}
      <DashboardActions 
        users={users} 
        selectedUserId={stringUserId} 
        selectedMonth={month} 
      />

      <KpiStrip overview={overview} />

      <div className="content-grid">
        <div className="grid-column-left">
          <SpendingChart rows={overview.dailyTrend} />
          <RecentTransactions transactions={overview.recentTransactions} />
        </div>
        <div className="grid-column-right">
          <FoodSummaryCard summary={foodSummary} />
          <TopSpenders rows={overview.topShops} />
          <SyncStatusCard 
            latestSync={overview.latestSync} 
            totalDbTransactions={overview.totalDbTransactions} 
          />
        </div>
      </div>

      <CategoryBars rows={overview.spendingByCategory} />
    </AppShell>
  );
}

interface LoadOverviewResult {
  users: AppUser[];
  overview: OverviewData;
  foodSummary: any;
  error: string | null;
}

async function loadOverview(filters: { userId?: string | number | null; month?: string | null }): Promise<LoadOverviewResult> {
  try {
    const [users, overview, foodSummary] = await Promise.all([
      getUsers(),
      getOverview(filters),
      getFoodLogSummary(filters)
    ]);

    return { users, overview, foodSummary, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      users: [],
      overview: {
        userId: null,
        month: filters.month || getCurrentMonthKey(),
        totalExpense: 0,
        todayExpense: 0,
        transactionCount: 0,
        totalBudget: 0,
        remainingBudget: 0,
        spendingByCategory: [],
        topShops: [],
        dailyTrend: [],
        latestSync: null,
        recentTransactions: [],
        totalDbTransactions: 0
      },
      foodSummary: {
        todayEstimatedKcal: 0,
        todayEstimatedKcalMin: 0,
        todayEstimatedKcalMax: 0,
        todayProtein: 0,
        todayProteinGoal: 0,
        todayCarbs: 0,
        todayCarbsGoal: 0,
        todayFat: 0,
        todayFatGoal: 0,
        latestWeight: null,
        latestWaist: null,
        averageConfidence: 0,
        totalMealsToday: 0,
        monthlyEstimatedKcal: 0,
        latestFoodLogDate: null
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


