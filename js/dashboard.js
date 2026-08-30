/* ==========================================================
   London Community Watch - dashboard analytics
   High-contrast, responsive data visualizations
   ========================================================== */

"use strict";

let trendChart = null;
let categoryChart = null;
let statusChart = null;
let lastDashboardData = null;

/* ---------- 1. DATA LOADING & AGGREGATION ---------- */

function updateKpis(data) {
  document.getElementById("kpi-total").textContent = data.length;

  const activeCount = data.filter(r => r.status === "reported" || r.status === "in progress").length;
  document.getElementById("kpi-active").textContent = activeCount;

  const resolvedCount = data.filter(r => r.status === "resolved").length;
  document.getElementById("kpi-resolved").textContent = resolvedCount;

  const confirmationsSum = data.reduce((sum, r) => sum + (r.confirmations || 0), 0);
  document.getElementById("kpi-confirmations").textContent = confirmationsSum;
}

function getCategoryData(data) {
  const categories = Object.keys(CONFIG.CATEGORY_COLORS);
  const counts = categories.map(cat => data.filter(r => r.category === cat).length);
  const colors = categories.map(cat => CONFIG.CATEGORY_COLORS[cat]);

  return {
    labels: categories,
    datasets: [{
      label: "Reports",
      data: counts,
      backgroundColor: colors.map(c => c + "ee"), // 93% opacity for vibrant punch
      borderColor: colors,
      borderWidth: 2,
      borderRadius: 6
    }]
  };
}

function getStatusData(data) {
  const statuses = ["reported", "in progress", "resolved"];
  const counts = statuses.map(st => data.filter(r => (r.status || "reported") === st).length);
  const colors = ["#EF4444", "#F59E0B", "#10B981"]; // Vivid Red, Amber, Emerald

  return {
    labels: ["Reported", "In Progress", "Resolved"],
    datasets: [{
      data: counts,
      backgroundColor: colors,
      borderColor: document.body.classList.contains("dark-theme") ? "#1E293B" : "#FFFFFF",
      borderWidth: 3,
      hoverOffset: 6
    }]
  };
}

function getTrendData(data, isDark) {
  const trend = new Map();
  // Initialize map with last 14 days of 0s
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    trend.set(dateStr, 0);
  }

  // Count reports matching dates
  data.forEach(r => {
    const dateStr = new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    if (trend.has(dateStr)) {
      trend.set(dateStr, trend.get(dateStr) + 1);
    }
  });

  const lineColor = isDark ? "#38BDF8" : "#0284C7";
  const fillColor = isDark ? "rgba(56, 189, 248, 0.2)" : "rgba(2, 132, 199, 0.15)";

  return {
    labels: [...trend.keys()],
    datasets: [{
      label: "New Reports",
      data: [...trend.values()],
      borderColor: lineColor,
      backgroundColor: fillColor,
      borderWidth: 3.5,
      fill: true,
      tension: 0.35,
      pointBackgroundColor: lineColor,
      pointBorderColor: isDark ? "#0F172A" : "#FFFFFF",
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7
    }]
  };
}

/* ---------- 2. CHART THEME CONFIGURATION ---------- */

function getThemeOptions() {
  const isDark = document.body.classList.contains("dark-theme");
  return {
    isDark,
    textColor: isDark ? "#FFFFFF" : "#0F172A",
    textColorMuted: isDark ? "#E2E8F0" : "#334155",
    gridColor: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(15, 23, 42, 0.08)",
    tooltipBg: isDark ? "#0F172A" : "#FFFFFF",
    tooltipColor: isDark ? "#FFFFFF" : "#0F172A",
    tooltipBorder: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.15)"
  };
}

/* ---------- 3. RENDERING CHARTS ---------- */

function renderCharts(data) {
  if (!data) return;
  lastDashboardData = data;
  const themeOpts = getThemeOptions();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: themeOpts.textColor,
          font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", weight: "700", size: 13 }
        }
      },
      tooltip: {
        backgroundColor: themeOpts.tooltipBg,
        titleColor: themeOpts.tooltipColor,
        bodyColor: themeOpts.tooltipColor,
        borderColor: themeOpts.tooltipBorder,
        borderWidth: 1.5,
        padding: 12,
        boxPadding: 8,
        titleFont: { weight: "700", size: 14 },
        bodyFont: { weight: "500", size: 13 }
      }
    }
  };

  // --- 1. Trend Line Chart ---
  const trendData = getTrendData(data, themeOpts.isDark);
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: trendData,
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: {
            color: themeOpts.textColorMuted,
            font: { family: "inherit", weight: "600", size: 12 }
          },
          grid: { color: themeOpts.gridColor }
        },
        y: {
          ticks: {
            color: themeOpts.textColorMuted,
            font: { family: "inherit", weight: "600", size: 12 },
            stepSize: 1
          },
          grid: { color: themeOpts.gridColor },
          beginAtZero: true
        }
      }
    }
  });

  // --- 2. Category Bar Chart ---
  const catData = getCategoryData(data);
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "bar",
    data: catData,
    options: {
      ...commonOptions,
      indexAxis: "y",
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: {
            color: themeOpts.textColorMuted,
            font: { family: "inherit", weight: "600", size: 12 },
            stepSize: 1
          },
          grid: { color: themeOpts.gridColor },
          beginAtZero: true
        },
        y: {
          ticks: {
            color: themeOpts.textColor,
            font: { family: "inherit", weight: "700", size: 13 }
          },
          grid: { display: false }
        }
      }
    }
  });

  // --- 3. Status Doughnut Chart ---
  const statusData = getStatusData(data);
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById("statusChart"), {
    type: "doughnut",
    data: statusData,
    options: {
      ...commonOptions,
      cutout: "62%",
      plugins: {
        ...commonOptions.plugins,
        legend: {
          position: "bottom",
          labels: {
            color: themeOpts.textColor,
            font: { family: "inherit", weight: "700", size: 13 },
            padding: 18,
            boxWidth: 16,
            boxHeight: 16,
            borderRadius: 4,
            useBorderRadius: true
          }
        }
      }
    }
  });
}

/* ---------- 4. REAL-TIME EVENTS & INIT ---------- */

async function loadData() {
  let data;
  try {
    const res = await fetch("/api/reports");
    if (!res.ok) throw new Error("Request failed");
    data = await res.json();
  } catch (err) {
    console.error("Error loading dashboard data:", err);
    return;
  }
  updateKpis(data);
  renderCharts(data);
}

// Observe theme mutations on body to re-render charts with high contrast
const themeObserver = new MutationObserver(() => {
  if (lastDashboardData) {
    renderCharts(lastDashboardData);
  }
});
themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

// Polling interval
const POLL_INTERVAL_MS = 15000;
setInterval(loadData, POLL_INTERVAL_MS);

// Initial load
loadData();
