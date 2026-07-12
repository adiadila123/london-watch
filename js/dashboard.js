/* ==========================================================
   London Community Watch - dashboard analytics
   ========================================================== */

"use strict";

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let trendChart = null;
let categoryChart = null;
let statusChart = null;

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
      backgroundColor: colors.map(c => c + "cc"), // 80% opacity
      borderColor: colors,
      borderWidth: 1.5,
      borderRadius: 6
    }]
  };
}

function getStatusData(data) {
  const statuses = ["reported", "in progress", "resolved"];
  const counts = statuses.map(st => data.filter(r => (r.status || "reported") === st).length);
  const colors = ["#DC241F", "#E08600", "#007D32"];

  return {
    labels: ["Reported", "In Progress", "Resolved"],
    datasets: [{
      data: counts,
      backgroundColor: colors,
      borderWidth: 0,
      hoverOffset: 4
    }]
  };
}

function getTrendData(data) {
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

  return {
    labels: [...trend.keys()],
    datasets: [{
      label: "New Reports",
      data: [...trend.values()],
      borderColor: "#0066CC",
      backgroundColor: "rgba(0, 102, 204, 0.1)",
      borderWidth: 3,
      fill: true,
      tension: 0.35,
      pointBackgroundColor: "#0066CC",
      pointRadius: 4
    }]
  };
}

/* ---------- 2. CHART THEME CONFIGURATION ---------- */

function getThemeOptions() {
  const isDark = document.body.classList.contains("dark-theme");
  return {
    textColor: isDark ? "#c0c0c5" : "#555555",
    gridColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    tooltipBg: isDark ? "#1e1e24" : "#ffffff",
    tooltipColor: isDark ? "#ffffff" : "#000000",
    tooltipBorder: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
  };
}

function updateChartsTheme() {
  const opts = getThemeOptions();
  const charts = [trendChart, categoryChart, statusChart];
  
  charts.forEach(chart => {
    if (!chart) return;
    
    // Update scales (for trend and category charts)
    if (chart.options.scales) {
      if (chart.options.scales.x) {
        chart.options.scales.x.ticks.color = opts.textColor;
        chart.options.scales.x.grid.color = opts.gridColor;
      }
      if (chart.options.scales.y) {
        chart.options.scales.y.ticks.color = opts.textColor;
        chart.options.scales.y.grid.color = opts.gridColor;
      }
    }
    
    // Update legends
    if (chart.options.plugins && chart.options.plugins.legend) {
      chart.options.plugins.legend.labels.color = opts.textColor;
    }
    
    // Update tooltips
    if (chart.options.plugins && chart.options.plugins.tooltip) {
      chart.options.plugins.tooltip.backgroundColor = opts.tooltipBg;
      chart.options.plugins.tooltip.titleColor = opts.tooltipColor;
      chart.options.plugins.tooltip.bodyColor = opts.tooltipColor;
      chart.options.plugins.tooltip.borderColor = opts.tooltipBorder;
    }
    
    chart.update("none"); // skip animation on theme switch for snappy feel
  });
}

/* ---------- 3. RENDERING CHARTS ---------- */

function renderCharts(data) {
  const themeOpts = getThemeOptions();

  // Common chart configuration options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: themeOpts.textColor,
          font: { family: "inherit", weight: "600" }
        }
      },
      tooltip: {
        backgroundColor: themeOpts.tooltipBg,
        titleColor: themeOpts.tooltipColor,
        bodyColor: themeOpts.tooltipColor,
        borderColor: themeOpts.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        boxPadding: 6
      }
    }
  };

  // --- 1. Trend Line Chart ---
  const trendData = getTrendData(data);
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: trendData,
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false } // trend label is self-explanatory
      },
      scales: {
        x: {
          ticks: { color: themeOpts.textColor, font: { family: "inherit" } },
          grid: { color: themeOpts.gridColor }
        },
        y: {
          ticks: { color: themeOpts.textColor, font: { family: "inherit" }, stepSize: 1 },
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
      indexAxis: "y", // horizontal bar chart
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: themeOpts.textColor, font: { family: "inherit" }, stepSize: 1 },
          grid: { color: themeOpts.gridColor },
          beginAtZero: true
        },
        y: {
          ticks: { color: themeOpts.textColor, font: { family: "inherit" } },
          grid: { display: false } // clean horizontal axis
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
      cutout: "65%",
      plugins: {
        ...commonOptions.plugins,
        legend: {
          position: "bottom",
          labels: {
            color: themeOpts.textColor,
            padding: 16
          }
        }
      }
    }
  });
}

/* ---------- 4. REAL-TIME EVENTS & INIT ---------- */

async function loadData() {
  const { data, error } = await db
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading dashboard data:", error);
    return;
  }
  updateKpis(data);
  renderCharts(data);
}

// Observe theme mutations on body to update chart aesthetics dynamically
const themeObserver = new MutationObserver(() => {
  updateChartsTheme();
});
themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

// Supabase Real-time updates sync
db.channel("reports-dashboard")
  .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
    loadData(); // Re-fetch and re-render on database changes
  })
  .subscribe();

// Initial load
loadData();
