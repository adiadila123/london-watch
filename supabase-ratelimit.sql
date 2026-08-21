-- ============================================================
-- London Community Watch - rate limiting for report submission
-- Run this AFTER supabase-setup.sql, supabase-upgrade.sql and
-- supabase-confirmations.sql, in: Supabase Dashboard > SQL Editor
--
-- Problem this fixes: the anon INSERT policy on reports only checks
-- shape (category/description/lat/lng via CHECK constraints), not
-- volume. A script with the public anon key can insert thousands of
-- form-valid reports.
--
-- Fix: the anon INSERT policy is dropped, so the anon key can no
-- longer create reports at all. The submit-report Edge Function (see
-- supabase/functions/submit-report/index.ts) becomes the only insert
-- path. Before inserting, it hashes the visitor's real IP (same
-- scheme as confirm-report / supabase-confirmations.sql) and calls
-- check_report_rate_limit() below, which atomically counts + records
-- submissions per voter_hash in the last hour and rejects once the
-- caller-supplied threshold is hit.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RATE LIMIT TABLE (one row per report submission attempt that
--    passed the check, keyed by hashed IP)
-- ------------------------------------------------------------
create table if not exists public.report_rate_limits (
  id         bigint generated always as identity primary key,
  voter_hash text not null,
  created_at timestamptz not null default now()
);

-- Speeds up the "count this voter_hash's rows from the last hour"
-- lookup as the table grows.
create index if not exists report_rate_limits_voter_created_idx
  on public.report_rate_limits (voter_hash, created_at);

-- RLS is enabled but deliberately has NO policies for anon/authenticated,
-- same reasoning as public.confirmations: the only access path is the
-- SECURITY DEFINER function below, called from the submit-report Edge
-- Function with the service role key.
alter table public.report_rate_limits enable row level security;

-- ------------------------------------------------------------
-- 2. RATE LIMIT CHECK-AND-RECORD FUNCTION
-- Atomically checks whether voter_hash is under p_max_per_hour
-- submissions in the trailing hour and, if so, records this one.
-- ------------------------------------------------------------
create or replace function public.check_report_rate_limit(
  p_voter_hash text,
  p_max_per_hour integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  -- Serialize concurrent calls for the same voter within this
  -- transaction, so two requests arriving at the same instant can't
  -- both read a count that's under the limit before either has
  -- inserted its row (check-then-act race).
  perform pg_advisory_xact_lock(hashtext(p_voter_hash));

  select count(*) into current_count
    from public.report_rate_limits
   where voter_hash = p_voter_hash
     and created_at > now() - interval '1 hour';

  if current_count >= p_max_per_hour then
    return false;
  end if;

  insert into public.report_rate_limits (voter_hash) values (p_voter_hash);
  return true;
end;
$$;

-- Only the submit-report Edge Function (service role key) may call
-- this. If anon/authenticated could call it directly, they could just
-- pass a fresh random voter_hash every time and the limit would be
-- worthless - same reasoning as increment_confirmations.
revoke all on function public.check_report_rate_limit(text, integer) from public;
grant execute on function public.check_report_rate_limit(text, integer) to service_role;

-- ------------------------------------------------------------
-- 3. LOCK DOWN DIRECT INSERT
-- The Edge Function inserts with the service role key, which
-- bypasses RLS (the reports_* CHECK constraints still apply either
-- way). Dropping this policy means the anon key can no longer insert
-- into reports at all - every submission must go through the rate
-- limit check above.
-- ------------------------------------------------------------
drop policy if exists "Public can create reports" on public.reports;

-- ------------------------------------------------------------
-- Optional housekeeping: report_rate_limits only needs rows from the
-- last hour, so it's safe to periodically delete older ones (not
-- required for correctness - check_report_rate_limit already ignores
-- anything past the 1-hour window - this just keeps the table small).
-- Run manually or on a schedule (e.g. pg_cron) if it ever matters:
--
--   delete from public.report_rate_limits
--    where created_at < now() - interval '1 day';
-- ------------------------------------------------------------

-- ============================================================
-- After running this file:
--   1. Deploy the Edge Function:
--        supabase functions deploy submit-report
--   2. It reuses the VOTER_HASH_SALT secret from confirm-report. If
--      you haven't set one yet:
--        supabase secrets set VOTER_HASH_SALT=<random-string>
--   3. (Optional) override the default threshold of 8 reports/hour
--      per IP without redeploying:
--        supabase secrets set MAX_REPORTS_PER_HOUR=15
-- ============================================================
