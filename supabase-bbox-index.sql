-- ============================================================
-- London Community Watch - viewport query index
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- js/app.js now fetches only the reports inside the map's current
-- bounding box (lat/lng BETWEEN ... instead of loading up to 1000
-- rows on every page view). This composite index lets Postgres use
-- an index range scan on lat (and filter lng from the same index
-- entries) instead of a sequential scan, which matters once the
-- table grows past a few thousand rows.
-- ============================================================

create index if not exists reports_lat_lng_idx on public.reports (lat, lng);
