-- ============================================================
-- London Community Watch - server-side confirmation dedup
-- Run this AFTER supabase-setup.sql (and supabase-upgrade.sql, if you
-- already applied it) in: Supabase Dashboard > SQL Editor > New query
--
-- Problem this fixes: the old increment_confirmations(report_id) RPC
-- was a bare +1 that any visitor could call from the browser console
-- in a loop to inflate reports.confirmations. The "already confirmed"
-- guard only lived in localStorage on the client, which is trivially
-- bypassed.
--
-- Fix: confirmations are now deduplicated server-side, one row per
-- (report_id, voter_hash). voter_hash is computed from the visitor's
-- IP address inside the confirm-report Edge Function (see
-- supabase/functions/confirm-report/index.ts), never trusted from the
-- browser. reports.confirmations is recomputed from this table on
-- every call, so it can never drift.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONFIRMATIONS TABLE (one row per report + voter pair)
-- ------------------------------------------------------------
create table if not exists public.confirmations (
  report_id  uuid not null references public.reports (id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  primary key (report_id, voter_hash)
);

-- RLS is enabled but deliberately has NO policies for anon/authenticated.
-- The only access path is the SECURITY DEFINER function below, called
-- from the confirm-report Edge Function with the service role key
-- (which bypasses RLS entirely, so no policy is needed for it either).
alter table public.confirmations enable row level security;

-- ------------------------------------------------------------
-- 2. REPLACE increment_confirmations
-- Old signature was (report_id uuid). New signature adds voter_hash,
-- so drop the old one explicitly - Postgres treats different argument
-- lists as different functions and would otherwise keep both around.
-- ------------------------------------------------------------
drop function if exists public.increment_confirmations(uuid);

create or replace function public.increment_confirmations(report_id uuid, voter_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
begin
  insert into public.confirmations (report_id, voter_hash)
  values (report_id, voter_hash)
  on conflict (report_id, voter_hash) do nothing;

  update public.reports
     set confirmations = (
       select count(*) from public.confirmations c where c.report_id = reports.id
     )
   where id = report_id
  returning confirmations into new_total;

  return new_total;
end;
$$;

-- IMPORTANT: this function is intentionally NOT reachable by anon or
-- authenticated. If the browser could call it directly, a visitor
-- could just pass a fresh random voter_hash on every call and inflate
-- the counter exactly like before - the dedup key would be worthless.
-- Only the confirm-report Edge Function may call it, using the
-- service role key and a voter_hash it derives itself from the real
-- request IP.
revoke all on function public.increment_confirmations(uuid, text) from public;
grant execute on function public.increment_confirmations(uuid, text) to service_role;

-- ============================================================
-- Manual steps after running this file - see the chat summary for
-- the full list (deploying the Edge Function, setting its secret
-- salt, etc).
-- ============================================================
