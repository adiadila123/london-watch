-- ============================================================
-- London Community Watch - UPGRADE script (run AFTER the original
-- supabase-setup.sql, in SQL Editor > New query)
--
-- Adds: report status lifecycle + admin (authenticated) powers.
-- IMPORTANT: replace ADMIN@EXAMPLE.COM below (2 policies + storage)
-- with the email you will use to log in to admin.html.
-- ============================================================

-- ------------------------------------------------------------
-- 1. STATUS COLUMN
-- ------------------------------------------------------------
alter table public.reports
  add column if not exists status text not null default 'reported';

alter table public.reports
  add constraint reports_status_check
  check (status in ('reported', 'in progress', 'resolved'));

-- ------------------------------------------------------------
-- 2. ADMIN POLICIES
-- Only the account with this exact email can change or delete
-- reports. Anonymous visitors are unaffected.
-- ------------------------------------------------------------
create policy "Admin can update reports"
  on public.reports
  for update
  to authenticated
  using      (auth.jwt() ->> 'email' = 'adi.ionescu.dev@gmail.com')   -- TODO: Înlocuiește aici
  with check (auth.jwt() ->> 'email' = 'adi.ionescu.dev@gmail.com');  -- TODO: Înlocuiește aici

create policy "Admin can delete reports"
  on public.reports
  for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'adi.ionescu.dev@gmail.com');       -- TODO: Înlocuiește aici

-- Admin can also read (the anon SELECT policy only covers role anon)
create policy "Admin can read reports"
  on public.reports
  for select
  to authenticated
  using (true);

-- Admin can delete photos from storage when removing a report
create policy "Admin can delete report photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and auth.jwt() ->> 'email' = 'adi.ionescu.dev@gmail.com'          -- TODO: Înlocuiește aici
  );

-- ------------------------------------------------------------
-- 3. REALTIME DELETE EVENTS
-- Default replica identity only ships the primary key on DELETE,
-- which is all the frontend needs to remove a marker. This line
-- just makes it explicit.
-- ------------------------------------------------------------
alter table public.reports replica identity default;

-- ============================================================
-- AFTER RUNNING THIS SCRIPT, do these two things in the dashboard:
--
-- 1. Authentication > Sign In / Up > disable "Allow new users
--    to sign up" (otherwise strangers can create accounts; they
--    still could not admin anything thanks to the email check
--    above, but there is no reason to allow it).
--
-- 2. Authentication > Users > Add user > create the admin account
--    with the SAME email you put in the policies above, plus a
--    strong password. Tick "Auto confirm user".
-- ============================================================
