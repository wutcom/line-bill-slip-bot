const { getSheetRows } = require('./sheets.service');
const { parseTransactionDate } = require('../utils/date.util');

const BODY_METRICS_SHEET_NAME = process.env.BODY_METRICS_SHEET_NAME || 'BodyMetrics';
const QUICKCHART_CREATE_URL = 'https://quickchart.io/chart/create';

const DEFAULT_DAYS = 90;
const MAX_POINTS = 30;
const MAX_HISTORY_LINES = 5;

const COL = {
  createdAt: 0,
  userId: 2,
  reportDate: 3,
  weightKg: 4,
  bodyFatPct: 6,
  muscleMassKg: 7,
  fatMassKg: 12
};

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

async function getBodyMetricsReport(userId, commandText) {
  const days = parseDaysFromCommand(commandText);
  const entries = await loadBodyMetricsHistory(userId, days);

  if (entries.length === 0) {
    return {
      text: 'ยังไม่มีข้อมูลสุขภาพย้อนหลังครับ ส่งรูปรายงานน้ำหนัก/ไขมันเข้ามาก่อนนะครับ',
      chartUrl: null
    };
  }

  const text = buildDeltaSummary(entries, days);
  const chartUrl = await buildChartUrl(entries);

  return { text, chartUrl };
}

function parseDaysFromCommand(commandText) {
  const match = String(commandText || '').match(/(\d{1,4})\s*วัน/);
  if (match) {
    const days = Number(match[1]);
    if (Number.isFinite(days) && days > 0) return days;
  }

  if (/เดือน/.test(String(commandText || ''))) return 30;

  return DEFAULT_DAYS;
}

async function loadBodyMetricsHistory(userId, days) {
  const rows = await getSheetRows(BODY_METRICS_SHEET_NAME, 'A:P');
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const entries = rows
    .slice(1)
    .filter((row) => !userId || normalize(row[COL.userId]) === normalize(userId))
    .map((row) => {
      const date = resolveEntryDate(row);

      return {
        date,
        time: date ? date.getTime() : 0,
        weightKg: toNumber(row[COL.weightKg]),
        fatMassKg: toNumber(row[COL.fatMassKg]),
        muscleMassKg: toNumber(row[COL.muscleMassKg]),
        bodyFatPct: toNumber(row[COL.bodyFatPct])
      };
    })
    .filter((entry) => entry.time > 0 && entry.time >= cutoff)
    .sort((a, b) => a.time - b.time);

  return entries.slice(-MAX_POINTS);
}

function resolveEntryDate(row) {
  const reportDate = parseTransactionDate(row[COL.reportDate]);
  if (reportDate) return reportDate;

  const createdAt = row[COL.createdAt] ? new Date(row[COL.createdAt]) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) return createdAt;

  return null;
}

function buildDeltaSummary(entries, days) {
  const latest = entries[entries.length - 1];
  const first = entries[0];

  const metricLines = [
    formatMetricLine('น้ำหนัก', latest.weightKg, first.weightKg, 'kg'),
    formatMetricLine('น้ำหนักไขมัน', latest.fatMassKg, first.fatMassKg, 'kg'),
    formatMetricLine('มวลกล้ามเนื้อ', latest.muscleMassKg, first.muscleMassKg, 'kg'),
    formatMetricLine('% ไขมัน', latest.bodyFatPct, first.bodyFatPct, '%')
  ].filter(Boolean);

  const historyLines = entries
    .slice(-MAX_HISTORY_LINES)
    .reverse()
    .map((entry) => {
      const parts = [
        entry.weightKg != null ? `${formatNumber(entry.weightKg)}kg` : null,
        entry.bodyFatPct != null ? `ไขมัน ${formatNumber(entry.bodyFatPct)}%` : null,
        entry.muscleMassKg != null ? `กล้าม ${formatNumber(entry.muscleMassKg)}` : null
      ].filter(Boolean);

      return `${formatThaiDate(entry.date)}  ${parts.join(' | ') || '-'}`;
    });

  return `สรุปสุขภาพย้อนหลัง (${entries.length} ครั้ง / ${days} วัน)
ล่าสุด ${formatThaiDate(latest.date)}

${metricLines.join('\n')}

รายการล่าสุด:
${historyLines.join('\n')}`;
}

function formatMetricLine(label, latestValue, firstValue, unit) {
  if (latestValue == null) return null;

  const deltaText = formatDelta(latestValue, firstValue, unit);
  const unitText = unit === '%' ? '%' : ` ${unit}`;

  return `${label}: ${formatNumber(latestValue)}${unitText} ${deltaText}`;
}

function formatDelta(latestValue, firstValue, unit) {
  if (firstValue == null || latestValue == null) return '(ครั้งแรก)';

  const diff = latestValue - firstValue;
  const rounded = Math.round(diff * 10) / 10;

  if (rounded === 0) return '(เท่าเดิม)';

  const sign = rounded > 0 ? '+' : '';
  const unitText = unit === '%' ? '%' : ` ${unit}`;

  return `(${sign}${formatNumber(rounded)}${unitText})`;
}

async function buildChartUrl(entries) {
  const config = buildChartConfig(entries);

  try {
    const response = await fetch(QUICKCHART_CREATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: '4',
        backgroundColor: 'white',
        width: 700,
        height: 420,
        format: 'png',
        chart: config
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.success && data.url) return data.url;
    }

    console.error('QuickChart create failed:', response.status);
  } catch (error) {
    console.error('QuickChart create error:', error.message);
  }

  return buildInlineChartUrl(config);
}

function buildInlineChartUrl(config) {
  const payload = {
    v: '4',
    bkg: 'white',
    w: 700,
    h: 420,
    c: JSON.stringify(config)
  };

  const query = new URLSearchParams(payload).toString();
  return `https://quickchart.io/chart?${query}`;
}

function buildChartConfig(entries) {
  const labels = entries.map((entry) => formatThaiDate(entry.date));

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        dataset('น้ำหนัก (kg)', entries.map((e) => e.weightKg), '#2563eb', 'y'),
        dataset('มวลกล้ามเนื้อ (kg)', entries.map((e) => e.muscleMassKg), '#16a34a', 'y'),
        dataset('น้ำหนักไขมัน (kg)', entries.map((e) => e.fatMassKg), '#ea580c', 'y'),
        dataset('% ไขมัน', entries.map((e) => e.bodyFatPct), '#dc2626', 'y1')
      ]
    },
    options: {
      title: { display: true, text: 'แนวโน้มสุขภาพย้อนหลัง' },
      scales: {
        y: { position: 'left', title: { display: true, text: 'kg' } },
        y1: {
          position: 'right',
          title: { display: true, text: '% ไขมัน' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  };
}

function dataset(label, data, color, yAxisID) {
  return {
    label,
    data: data.map((value) => (value == null ? null : value)),
    borderColor: color,
    backgroundColor: color,
    yAxisID,
    tension: 0.3,
    fill: false,
    spanGaps: true
  };
}

function formatThaiDate(date) {
  if (!date) return '-';
  return `${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]}`;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function normalize(value) {
  return String(value || '').trim();
}

module.exports = {
  getBodyMetricsReport
};
