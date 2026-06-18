import { formatNumber } from '../lib/format';

interface FoodSummaryCardProps {
  summary: {
    todayEstimatedKcal: number;
    todayEstimatedKcalMin: number;
    todayEstimatedKcalMax: number;
    todayProtein: number;
    todayProteinGoal: number;
    todayCarbs: number;
    todayCarbsGoal: number;
    todayFat: number;
    todayFatGoal: number;
    latestFoodLogDate: string | null;
  };
}

export default function FoodSummaryCard({ summary }: FoodSummaryCardProps) {
  const latestDateText = summary.latestFoodLogDate 
    ? new Date(summary.latestFoodLogDate).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'No data yet';

  return (
    <div className="food-summary-card">
      <div className="card-header">
        <span className="card-icon">🥗</span>
        <h3>Food Summary</h3>
        <span className="card-subtitle">Today's Intake</span>
      </div>

      <div className="food-kpi-main">
        <div className="main-kcal">
          <strong>{formatNumber(summary.todayEstimatedKcal)}</strong>
          <span>kcal today</span>
        </div>
        <div className="kcal-range">
          Range: {formatNumber(summary.todayEstimatedKcalMin)} - {formatNumber(summary.todayEstimatedKcalMax)} kcal
        </div>
      </div>

      <div className="macro-progress-grid">
        <div className="macro-item">
          <div className="macro-info">
            <span>Protein</span>
            <strong>{formatNumber(summary.todayProtein)}g / {formatNumber(summary.todayProteinGoal)}g</strong>
          </div>
          <div className="macro-bar">
            <div 
              className="macro-fill protein-fill" 
              style={{ width: `${summary.todayProteinGoal > 0 ? Math.min((summary.todayProtein / summary.todayProteinGoal) * 100, 100) : 0}%` }}
            />
          </div>
        </div>

        <div className="macro-item">
          <div className="macro-info">
            <span>Carbs</span>
            <strong>{formatNumber(summary.todayCarbs)}g / {formatNumber(summary.todayCarbsGoal)}g</strong>
          </div>
          <div className="macro-bar">
            <div 
              className="macro-fill carbs-fill" 
              style={{ width: `${summary.todayCarbsGoal > 0 ? Math.min((summary.todayCarbs / summary.todayCarbsGoal) * 100, 100) : 0}%` }}
            />
          </div>
        </div>

        <div className="macro-item">
          <div className="macro-info">
            <span>Fat</span>
            <strong>{formatNumber(summary.todayFat)}g / {formatNumber(summary.todayFatGoal)}g</strong>
          </div>
          <div className="macro-bar">
            <div 
              className="macro-fill fat-fill" 
              style={{ width: `${summary.todayFatGoal > 0 ? Math.min((summary.todayFat / summary.todayFatGoal) * 100, 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="food-latest-date">
        <span>Latest Entry:</span> <strong>{latestDateText}</strong>
      </div>
    </div>
  );
}
