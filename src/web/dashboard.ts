import type { ClaudeCodeStats } from "../types";
import { colors } from "../image/design-tokens";

/**
 * Serialize stats for embedding in HTML / JSON API.
 * Converts Maps, Sets, and Dates to JSON-friendly structures.
 */
export function serializeStats(stats: ClaudeCodeStats) {
  return {
    ...stats,
    firstSessionDate: stats.firstSessionDate.toISOString(),
    dailyActivity: Object.fromEntries(stats.dailyActivity),
    dailyCost: Object.fromEntries(stats.dailyCost),
    maxStreakDays: Array.from(stats.maxStreakDays),
  };
}

export function generateDashboardHTML(stats: ClaudeCodeStats): string {
  const data = serializeStats(stats);
  const year = stats.year;

  // Pre-compute heatmap data for the template
  const heatmapLevels = colors.heatmap;
  const dailyEntries = Array.from(stats.dailyActivity.entries());
  const maxDailyCount = Math.max(...dailyEntries.map(([, c]) => c), 1);

  // Weekday labels
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Month labels
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Build heatmap grid data (week columns x 7 rows)
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startOffset = jan1.getDay(); // 0=Sun
  const totalDays =
    Math.floor((dec31.getTime() - jan1.getTime()) / 86400000) + 1;
  const totalSlots = startOffset + totalDays;
  const numWeeks = Math.ceil(totalSlots / 7);

  // Generate heatmap cells
  let heatmapCells = "";
  for (let week = 0; week < numWeeks; week++) {
    for (let day = 0; day < 7; day++) {
      const slotIndex = week * 7 + day;
      const dayIndex = slotIndex - startOffset;
      if (dayIndex < 0 || dayIndex >= totalDays) {
        heatmapCells += `<div class="hm-cell hm-empty" style="grid-column:${week + 1};grid-row:${day + 1}"></div>`;
        continue;
      }
      const d = new Date(year, 0, 1 + dayIndex);
      const key = d.toISOString().slice(0, 10);
      const count = stats.dailyActivity.get(key) || 0;
      const cost = stats.dailyCost.get(key) || 0;
      const level = count === 0 ? 0 : Math.min(7, Math.ceil((count / maxDailyCount) * 7));
      const levelColors = [
        heatmapLevels.empty,
        heatmapLevels.level1,
        heatmapLevels.level2,
        heatmapLevels.level3,
        heatmapLevels.level4,
        heatmapLevels.level5,
        heatmapLevels.level6,
        heatmapLevels.level7,
      ];
      const color = levelColors[level];
      const costStr = cost > 0 ? ` · $${cost.toFixed(2)}` : "";
      const tooltip = `${key}: ${count} message${count !== 1 ? "s" : ""}${costStr}`;
      heatmapCells += `<div class="hm-cell" style="grid-column:${week + 1};grid-row:${day + 1};background:${color}" title="${tooltip}"></div>`;
    }
  }

  // Month labels for heatmap
  let monthLabels = "";
  for (let m = 0; m < 12; m++) {
    const firstOfMonth = new Date(year, m, 1);
    const dayOfYear = Math.floor(
      (firstOfMonth.getTime() - jan1.getTime()) / 86400000
    );
    const weekCol = Math.floor((dayOfYear + startOffset) / 7) + 1;
    monthLabels += `<span style="grid-column:${weekCol};grid-row:1">${months[m]}</span>`;
  }

  // Format numbers
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  const fmtFull = (n: number) =>
    new Intl.NumberFormat("en-US").format(Math.round(n));
  const fmtCost = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code Wrapped ${year}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root {
    --bg: ${colors.background};
    --surface: ${colors.surface};
    --surface-border: ${colors.surfaceBorder};
    --text-primary: ${colors.text.primary};
    --text-secondary: ${colors.text.secondary};
    --text-tertiary: ${colors.text.tertiary};
    --text-muted: ${colors.text.muted};
    --accent: ${colors.accent.primary};
    --accent-hover: ${colors.accent.primaryHover};
    --accent-secondary: ${colors.accent.secondary};
    --accent-tertiary: ${colors.accent.tertiary};
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'IBM Plex Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    background: var(--bg);
    color: var(--text-primary);
    line-height: 1.5;
    min-height: 100vh;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 48px 24px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 48px;
  }
  .header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 4px;
    letter-spacing: -1px;
  }
  .header p {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 12px;
    padding: 24px;
  }
  .card h2 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    margin-bottom: 16px;
  }

  /* Metrics row */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .metric-card {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }
  .metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.1;
  }
  .metric-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-tertiary);
    margin-top: 6px;
  }
  .metric-detail {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* Heatmap */
  .heatmap-section { margin-bottom: 24px; }
  .heatmap-wrapper {
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .heatmap-months {
    display: grid;
    grid-template-rows: 1fr;
    gap: 0;
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-bottom: 4px;
    margin-left: 36px;
  }
  .heatmap-months span { white-space: nowrap; }
  .heatmap-body {
    display: flex;
    gap: 4px;
  }
  .heatmap-days {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.6rem;
    color: var(--text-muted);
    padding-top: 0;
  }
  .heatmap-days span {
    height: 13px;
    line-height: 13px;
    width: 28px;
    text-align: right;
    padding-right: 4px;
  }
  .heatmap-grid {
    display: grid;
    grid-template-columns: repeat(${numWeeks}, 13px);
    grid-template-rows: repeat(7, 13px);
    gap: 3px;
  }
  .hm-cell {
    width: 13px;
    height: 13px;
    border-radius: 2px;
  }
  .hm-cell:hover {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    cursor: pointer;
  }
  .hm-empty { background: transparent; }
  .hm-empty:hover { outline: none; cursor: default; }
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    margin-top: 8px;
    font-size: 0.6rem;
    color: var(--text-muted);
  }
  .heatmap-legend .hm-swatch {
    width: 13px;
    height: 13px;
    border-radius: 2px;
  }

  /* Charts grid */
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }
  @media (max-width: 768px) {
    .charts-grid { grid-template-columns: 1fr; }
  }
  .chart-container {
    position: relative;
    height: 280px;
  }

  /* Insights */
  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .insight-card {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 12px;
    padding: 20px;
  }
  .insight-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-tertiary);
    margin-bottom: 4px;
  }
  .insight-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .insight-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* Footer */
  .footer {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--surface-border);
  }
  .footer a {
    color: var(--accent);
    text-decoration: none;
  }
  .footer a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>Claude Code Wrapped ${year}</h1>
    <p>Your year in review</p>
  </div>

  <!-- Key Metrics -->
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">${fmt(stats.totalSessions)}</div>
      <div class="metric-label">Sessions</div>
      <div class="metric-detail">${fmtFull(stats.totalSessions)} total</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${fmt(stats.totalMessages)}</div>
      <div class="metric-label">Messages</div>
      <div class="metric-detail">${fmtFull(stats.totalMessages)} total</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${fmt(stats.totalTokens)}</div>
      <div class="metric-label">Tokens</div>
      <div class="metric-detail">${fmtFull(stats.totalTokens)} total</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${fmt(stats.totalProjects)}</div>
      <div class="metric-label">Projects</div>
    </div>
    ${
      stats.hasUsageCost
        ? `<div class="metric-card">
      <div class="metric-value">${fmtCost(stats.totalCost)}</div>
      <div class="metric-label">Estimated Cost</div>
    </div>`
        : ""
    }
    <div class="metric-card">
      <div class="metric-value">${stats.maxStreak}</div>
      <div class="metric-label">Day Streak</div>
      <div class="metric-detail">${stats.currentStreak} current</div>
    </div>
  </div>

  <!-- Activity Heatmap -->
  <div class="card heatmap-section">
    <h2>Activity</h2>
    <div class="heatmap-wrapper">
      <div class="heatmap-months" style="display:grid;grid-template-columns:repeat(${numWeeks},13px);gap:3px;margin-left:36px;">
        ${monthLabels}
      </div>
      <div class="heatmap-body">
        <div class="heatmap-days">
          ${weekdays.map((d) => `<span>${d}</span>`).join("")}
        </div>
        <div class="heatmap-grid">
          ${heatmapCells}
        </div>
      </div>
      <div class="heatmap-legend">
        <span>Less</span>
        <div class="hm-swatch" style="background:${heatmapLevels.empty}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level1}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level2}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level3}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level4}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level5}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level6}"></div>
        <div class="hm-swatch" style="background:${heatmapLevels.level7}"></div>
        <span>More</span>
      </div>
    </div>
  </div>

  <!-- Charts -->
  <div class="charts-grid">
    <!-- Daily Activity Chart -->
    <div class="card">
      <h2>Daily Activity</h2>
      <div class="chart-container">
        <canvas id="dailyChart"></canvas>
      </div>
    </div>
    <!-- Model Breakdown -->
    <div class="card">
      <h2>Top Models</h2>
      <div class="chart-container">
        <canvas id="modelChart"></canvas>
      </div>
    </div>
    <!-- Weekday Distribution -->
    <div class="card">
      <h2>Weekday Distribution</h2>
      <div class="chart-container">
        <canvas id="weekdayChart"></canvas>
      </div>
    </div>
    <!-- Token Breakdown -->
    <div class="card">
      <h2>Token Breakdown</h2>
      <div class="chart-container">
        <canvas id="tokenChart"></canvas>
      </div>
    </div>
  </div>

  <!-- Insights -->
  <div class="insights-grid">
    <div class="insight-card">
      <div class="insight-label">Cache Hit Rate</div>
      <div class="insight-value">${stats.cacheHitRate.toFixed(1)}%</div>
      <div class="insight-sub">${fmtFull(stats.totalCacheReadTokens)} tokens read from cache</div>
    </div>
    <div class="insight-card">
      <div class="insight-label">Tool Calls</div>
      <div class="insight-value">${fmt(stats.totalToolCalls)}</div>
      <div class="insight-sub">${fmtFull(stats.totalToolCalls)} total tool invocations</div>
    </div>
    <div class="insight-card">
      <div class="insight-label">Web Searches</div>
      <div class="insight-value">${fmt(stats.totalWebSearchRequests)}</div>
      <div class="insight-sub">${fmtFull(stats.totalWebSearchRequests)} total searches</div>
    </div>
    <div class="insight-card">
      <div class="insight-label">Peak Context Window</div>
      <div class="insight-value">${fmt(stats.peakContextWindow)}</div>
      <div class="insight-sub">${fmtFull(stats.peakContextWindow)} tokens in single context</div>
    </div>
    ${
      stats.mostActiveDay
        ? `<div class="insight-card">
      <div class="insight-label">Most Active Day</div>
      <div class="insight-value">${stats.mostActiveDay.formattedDate}</div>
      <div class="insight-sub">${fmtFull(stats.mostActiveDay.count)} messages</div>
    </div>`
        : ""
    }
    <div class="insight-card">
      <div class="insight-label">Most Active Weekday</div>
      <div class="insight-value">${stats.weekdayActivity.mostActiveDayName}</div>
      <div class="insight-sub">${fmtFull(stats.weekdayActivity.maxCount)} messages</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Generated by <a href="https://github.com/anthropics/claude-code">Claude Code</a> Wrapped</p>
  </div>

</div>

<script>
const STATS = ${JSON.stringify(data)};

// Color palette
const accent = '${colors.accent.primary}';
const accentSecondary = '${colors.accent.secondary}';
const accentTertiary = '${colors.accent.tertiary}';
const textMuted = '${colors.text.muted}';
const surfaceBorder = '${colors.surfaceBorder}';

// Chart.js defaults
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.color = textMuted;
Chart.defaults.borderColor = surfaceBorder;

// ---- Daily Activity Bar Chart ----
{
  const entries = Object.entries(STATS.dailyActivity).sort(([a],[b]) => a.localeCompare(b));
  const labels = entries.map(([d]) => d);
  const values = entries.map(([,v]) => v);

  new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Messages',
        data: values,
        backgroundColor: accent + 'CC',
        borderRadius: 2,
        barPercentage: 1,
        categoryPercentage: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => {
              const date = labels[item.dataIndex];
              const cost = STATS.dailyCost[date];
              const costStr = cost ? ' · $' + cost.toFixed(2) : '';
              return item.raw + ' messages' + costStr;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 12,
            callback: function(val, i) {
              const d = new Date(labels[i]);
              return d.toLocaleDateString('en-US', { month: 'short' });
            }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          grid: { color: surfaceBorder + '80' }
        }
      }
    }
  });
}

// ---- Model Donut Chart ----
{
  const models = STATS.topModels.slice(0, 8);
  const palette = [accent, accentSecondary, accentTertiary, '#8B6F5E', '#A89082', '#C4A882', '#7E3E34', '#6B5142'];

  new Chart(document.getElementById('modelChart'), {
    type: 'doughnut',
    data: {
      labels: models.map(m => m.name),
      datasets: [{
        data: models.map(m => m.count),
        backgroundColor: palette.slice(0, models.length),
        borderWidth: 2,
        borderColor: '${colors.surface}',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const m = models[item.dataIndex];
              return m.name + ': ' + m.percentage.toFixed(1) + '%';
            }
          }
        }
      }
    }
  });
}

// ---- Weekday Bar Chart ----
{
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = STATS.weekdayActivity.counts;

  new Chart(document.getElementById('weekdayChart'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Messages',
        data: counts,
        backgroundColor: counts.map((_, i) =>
          i === STATS.weekdayActivity.mostActiveDay ? accent : accent + '80'
        ),
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => item.raw.toLocaleString() + ' messages'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: surfaceBorder + '80' }
        }
      }
    }
  });
}

// ---- Token Breakdown Donut ----
{
  const labels = ['Input', 'Output', 'Cache Read', 'Cache Write'];
  const values = [
    STATS.totalInputTokens,
    STATS.totalOutputTokens,
    STATS.totalCacheReadTokens,
    STATS.totalCacheWriteTokens,
  ];
  const palette = [accent, accentSecondary, accentTertiary, '#8B6F5E'];

  new Chart(document.getElementById('tokenChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette,
        borderWidth: 2,
        borderColor: '${colors.surface}',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const v = item.raw;
              return item.label + ': ' + Number(v).toLocaleString() + ' tokens';
            }
          }
        }
      }
    }
  });
}
</script>
</body>
</html>`;
}
