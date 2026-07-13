/* London Community Watch - configuration */
const CONFIG = {
  SUPABASE_URL: "https://udcvgnbmrlqllyebzoyq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkY3ZnbmJtcmxxbGx5ZWJ6b3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTYwMDUsImV4cCI6MjA5OTQzMjAwNX0.bDH915ncOEIaCByQiBwqStV41fAqF356IgFd_pKrur8",

  BUCKET: "report-photos",
  MAX_PHOTO_MB: 5,

  LONDON_CENTER: [51.5074, -0.1278],
  LONDON_ZOOM: 13,
  LONDON_BOUNDS: [[51.28, -0.52], [51.70, 0.34]],

  CATEGORY_COLORS: {
    "Roads & Pavements":    "#DC241F",
    "Fly-tipping & Litter": "#B36305",
    "Street Lighting":      "#FFD300",
    "Parks & Green Spaces": "#007D32",
    "Public Transport":     "#0066CC",
    "Other":                "#6C6C6C"
  }
};
