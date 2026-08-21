// London Community Watch - confirm-report Edge Function
//
// The browser can no longer call the increment_confirmations RPC
// directly (see supabase-confirmations.sql - execute was revoked from
// anon/authenticated). Instead it calls this function, which:
//   1. reads the visitor's real IP from the request headers (the
//      browser cannot fake this the way it could fake an RPC argument),
//   2. hashes it into a stable, non-reversible voter_hash,
//   3. calls increment_confirmations with the service role key, which
//      is the only role allowed to execute it.
//
// Deploy with: supabase functions deploy confirm-report
// Requires one secret: supabase secrets set VOTER_HASH_SALT=<random-string>

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

// Hash "ip:salt" with SHA-256 so the raw IP is never stored or sent
// anywhere - only this one-way, per-deployment-salted digest is.
async function hashVoter(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ip}:${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let reportId: unknown;
  try {
    ({ report_id: reportId } = await req.json());
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (typeof reportId !== "string" || !UUID_RE.test(reportId)) {
    return jsonResponse({ error: "report_id must be a UUID" }, 400);
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

  // Service role key bypasses RLS and is the only credential allowed
  // to execute increment_confirmations (see supabase-confirmations.sql).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("increment_confirmations", {
    report_id: reportId,
    voter_hash: voterHash
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ confirmations: data });
});
