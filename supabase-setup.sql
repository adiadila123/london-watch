-- ============================================================
-- London Community Watch - Supabase setup script
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ------------------------------------------------------------
-- 1. REPORTS TABLE
-- ------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  description   text not null,
  photo_url     text,                          -- public URL from Supabase Storage (nullable)
  lat           double precision not null,
  lng           double precision not null,
  confirmations integer not null default 0,
  created_at    timestamptz not null default now(),

  -- Server-side validation (defence in depth, the frontend also validates)
  constraint reports_category_check check (
    category in (
      'Roads & Pavements',
      'Fly-tipping & Litter',
      'Street Lighting',
      'Parks & Green Spaces',
      'Public Transport',
      'Other'
    )
  ),
  constraint reports_description_len check (char_length(description) between 3 and 500),
  -- Rough bounding box for Greater London, rejects reports outside the city
  constraint reports_in_london check (
    lat between 51.28 and 51.70 and lng between -0.52 and 0.34
  )
);

-- Index so the "latest 10" feed query stays fast as the table grows
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.reports enable row level security;

-- SELECT: anyone (anonymous visitors) can read all reports
create policy "Public can read reports"
  on public.reports
  for select
  to anon
  using (true);

-- INSERT: anyone can submit a report.
-- The CHECK constraints above still apply, so garbage rows are rejected.
create policy "Public can create reports"
  on public.reports
  for insert
  to anon
  with check (
    confirmations = 0            -- new reports must start at zero
  );

-- UPDATE: deliberately NO general update policy.
-- If we allowed "for update using (true)", any visitor could rewrite
-- descriptions or reset counters with the anon key. Instead, the ONLY
-- write path after insert is the increment_confirmations() function
-- below, which runs as SECURITY DEFINER (it bypasses RLS in a controlled
-- way and can only ever do one thing: +1 on the counter).

-- ------------------------------------------------------------
-- 3. CONFIRMATION FUNCTION (atomic +1, safe against race conditions)
-- ------------------------------------------------------------
create or replace function public.increment_confirmations(report_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.reports
     set confirmations = confirmations + 1
   where id = report_id
  returning confirmations;
$$;

-- Allow anonymous visitors to call it
grant execute on function public.increment_confirmations(uuid) to anon;

-- ------------------------------------------------------------
-- 4. REALTIME (live counter + live feed)
-- ------------------------------------------------------------
-- Adds the table to Supabase Realtime so the frontend receives
-- INSERT/UPDATE events over websockets without polling.
alter publication supabase_realtime add table public.reports;

-- ------------------------------------------------------------
-- 5. STORAGE BUCKET FOR PHOTOS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  true,                                   -- public bucket: photos get a permanent public URL
  5242880,                                -- 5 MB per file
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Storage policies (storage.objects also uses RLS)
create policy "Public can view report photos"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'report-photos');

create policy "Public can upload report photos"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'report-photos');

-- No UPDATE/DELETE policies on storage: once uploaded, a photo cannot be
-- replaced or removed by anonymous users. Only you (dashboard/service role)
-- can moderate.

-- ============================================================
-- Done. Now copy your Project URL and anon key from
-- Settings > API into index.html (search for "TODO").
-- ============================================================
