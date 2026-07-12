/* ==========================================================
   London Community Watch - configuration
   Everything you might ever need to change lives here.
   The anon key is designed to be public: security comes from
   the RLS policies in Supabase, not from hiding this key.
   ========================================================== */

const CONFIG = {
  SUPABASE_URL: "https://udcvgnbmrlqllyebzoyq.supabase.co",   // TODO: Înlocuiește aici (Settings > API > Project URL)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkY3ZnbmJtcmxxbGx5ZWJ6b3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTYwMDUsImV4cCI6MjA5OTQzMjAwNX0.bDH915ncOEIaCByQiBwqStV41fAqF356IgFd_pKrur8",                 // TODO: Înlocuiește aici (Settings > API > anon public key)

  BUCKET: "report-photos",
  MAX_PHOTO_MB: 5,

  LONDON_CENTER: [51.5074, -0.1278],
  LONDON_ZOOM: 13,
  // Rough Greater London bounding box. Matches the CHECK constraint in SQL.
  LONDON_BOUNDS: [[51.28, -0.52], [51.70, 0.34]],

  // One colour per category, used for the map dots.
  CATEGORY_COLORS: {
    "Roads & Pavements":    "#DC241F",
    "Fly-tipping & Litter": "#B36305",
    "Street Lighting":      "#FFD300",
    "Parks & Green Spaces": "#007D32",
    "Public Transport":     "#0066CC",
    "Other":                "#6C6C6C"
  }
};

/* ---------- THEME MANAGEMENT ---------- */
(function() {
  function applyTheme() {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (prefersDark ? "dark" : "light");
    
    document.body.classList.remove("light-theme", "dark-theme");
    document.body.classList.add(theme + "-theme");
  }

  function bindToggle() {
    const toggleBtn = document.getElementById("theme-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-theme");
        const newTheme = isDark ? "light" : "dark";
        
        document.body.classList.remove("light-theme", "dark-theme");
        document.body.classList.add(newTheme + "-theme");
        localStorage.setItem("theme", newTheme);
      });
    }
  }

  // Apply theme immediately if body is ready, otherwise wait for DOMContentLoaded
  if (document.body) {
    applyTheme();
  } else {
    document.addEventListener("DOMContentLoaded", applyTheme);
  }

  // Bind toggle listener once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToggle);
  } else {
    bindToggle();
  }
})();
