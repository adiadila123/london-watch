// London Community Watch - submit-report Edge Function
//
// The browser can no longer INSERT into public.reports directly (see
// supabase-ratelimit.sql - the anon INSERT policy was dropped). This
// function is now the only way to create a report. It:
//   1. validates the payload shape (defence in depth - the reports_*
//      CHECK constraints in supabase-setup.sql are the real backstop),
//   2. reads the visitor's real IP from request headers and hashes it
//      into a voter_hash, same scheme as confirm-report,
//   3. calls check_report_rate_limit(), which atomically counts this
//      voter_hash's submissions in the last hour and records this one
//      if it's under the threshold,
//   4. on success, inserts the report with the service role key
//      (bypasses RLS; CHECK constraints still apply).
//
// Deploy with: supabase functions deploy submit-report
// Requires the same secret as confirm-report:
//   supabase secrets set VOTER_HASH_SALT=<random-string>
// Optional secret to change the threshold without redeploying:
//   supabase secrets set MAX_REPORTS_PER_HOUR=8   (default: 8)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Standard permissive CORS so the function is callable from the app's
// own origin as well as localhost during development.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Hash "ip:salt" with SHA-256, same scheme as confirm-report, so the
// raw IP is never stored or sent anywhere - only this one-way,
// per-deployment-salted digest is.
async function hashVoter(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ip}:${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Keep in sync with CONFIG.CATEGORY_COLORS (js/config.js) and the
// reports_category_check constraint (supabase-setup.sql).
const CATEGORIES = new Set([
  "Roads & Pavements",
  "Fly-tipping & Litter",
  "Street Lighting",
  "Parks & Green Spaces",
  "Public Transport",
  "Other"
]);

// Same bounding box as the reports_in_london CHECK constraint.
const LONDON_BOUNDS = { latMin: 51.28, latMax: 51.70, lngMin: -0.52, lngMax: 0.34 };

const DEFAULT_MAX_PER_HOUR = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { category, description, photo_url, lat, lng } = body ?? {};

  if (typeof category !== "string" || !CATEGORIES.has(category)) {
    return jsonResponse({ error: "Invalid category" }, 400);
  }
  if (typeof description !== "string" || description.length < 3 || description.length > 500) {
    return jsonResponse({ error: "Description must be 3-500 characters" }, 400);
  }
  if (photo_url !== null && photo_url !== undefined && typeof photo_url !== "string") {
    return jsonResponse({ error: "Invalid photo_url" }, 400);
  }
  if (
    typeof lat !== "number" || typeof lng !== "number" ||
    lat < LONDON_BOUNDS.latMin || lat > LONDON_BOUNDS.latMax ||
    lng < LONDON_BOUNDS.lngMin || lng > LONDON_BOUNDS.lngMax
  ) {
    return jsonResponse({ error: "Location must be within Greater London" }, 400);
  }

  const salt = Deno.env.get("VOTER_HASH_SALT");
  if (!salt) {
    return jsonResponse({ error: "Server misconfigured: missing VOTER_HASH_SALT" }, 500);
  }

  // Supabase's edge network sets x-forwarded-for to the real client IP;
  // it may contain a comma-separated chain if there are intermediate
  // proxies, so take the first (closest to the client) entry.
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0].trim();
  if (!ip) {
    return jsonResponse({ error: "Could not determine client IP" }, 400);
  }

  const voterHash = await hashVoter(ip, salt);
  const maxPerHour = Number(Deno.env.get("MAX_REPORTS_PER_HOUR")) || DEFAULT_MAX_PER_HOUR;

  // Service role key bypasses RLS and is the only credential allowed
  // to execute check_report_rate_limit (see supabase-ratelimit.sql).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: allowed, error: rateLimitError } = await supabase.rpc("check_report_rate_limit", {
    p_voter_hash: voterHash,
    p_max_per_hour: maxPerHour
  });

  if (rateLimitError) {
    return jsonResponse({ error: rateLimitError.message }, 500);
  }
  if (!allowed) {
    return jsonResponse(
      { error: `Too many reports from this connection - limit is ${maxPerHour} per hour. Please try again later.` },
      429
    );
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({ category, description, photo_url: photo_url ?? null, lat, lng })
    .select()
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse(data);
});
