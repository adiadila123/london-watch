/* ==========================================================
   London Community Watch - admin logic
   Sign in with the Supabase account whose email matches the
   RLS policies in supabase-upgrade.sql. From here you can:
     - change a report's status (reported / in progress / resolved)
     - delete a report (its photo is removed from Storage too)
   ========================================================== */

"use strict";

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const STATUSES = ["reported", "in progress", "resolved"];

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function setLoginStatus(msg, cls) {
  const el = document.getElementById("login-status");
  el.textContent = msg;
  el.className = cls || "";
}

/* ---------- AUTH ---------- */

async function refreshView() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    loginView.hidden = true;
    adminView.hidden = false;
    loadReports();
  } else {
    loginView.hidden = false;
    adminView.hidden = true;
  }
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return setLoginStatus("Enter email and password.", "err");

  setLoginStatus("Signing in\u2026");
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return setLoginStatus(error.message, "err");
  setLoginStatus("");
  refreshView();
});

// Enter key submits the login form.
document.getElementById("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  refreshView();
});

/* ---------- REPORT LIST ---------- */

async function loadReports() {
  const list = document.getElementById("report-list");
  const { data, error } = await db
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="hint">Could not load reports: ${escapeHtml(error.message)}</p>`;
    return;
  }

  document.getElementById("report-count").textContent =
    `${data.length} report${data.length === 1 ? "" : "s"}`;

  if (data.length === 0) {
    list.innerHTML = '<p class="hint">No reports yet.</p>';
    return;
  }

  list.innerHTML = "";
  data.forEach((r) => list.appendChild(buildRow(r)));
}

function buildRow(r) {
  const row = document.createElement("div");
  row.className = "admin-row";

  // Thumbnail (or empty placeholder)
  const img = document.createElement("img");
  img.className = "admin-thumb";
  img.loading = "lazy";
  img.alt = "";
  if (r.photo_url) img.src = r.photo_url;
  row.appendChild(img);

  // Details
  const info = document.createElement("div");
  info.innerHTML =
    `<div class="feed-cat">${escapeHtml(r.category)}</div>` +
    `<div class="feed-desc">${escapeHtml(r.description)}</div>` +
    `<div class="feed-meta">${new Date(r.created_at).toLocaleString("en-GB")}` +
    ` \u00B7 ${r.confirmations} confirmation${r.confirmations === 1 ? "" : "s"}</div>`;
  row.appendChild(info);

  // Actions: status dropdown + delete
  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const select = document.createElement("select");
  for (const st of STATUSES) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    if (st === (r.status || "reported")) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", async () => {
    select.disabled = true;
    const { error } = await db.from("reports")
      .update({ status: select.value })
      .eq("id", r.id);
    select.disabled = false;
    if (error) alert("Update failed: " + error.message);
  });
  actions.appendChild(select);

  const del = document.createElement("button");
  del.className = "btn-danger";
  del.textContent = "Delete";
  del.addEventListener("click", async () => {
    if (!confirm("Delete this report permanently?")) return;
    del.disabled = true;

    // Remove the photo from Storage first (if any).
    if (r.photo_url) {
      const path = r.photo_url.split(`/${CONFIG.BUCKET}/`)[1];
      if (path) await db.storage.from(CONFIG.BUCKET).remove([path]);
    }

    const { error } = await db.from("reports").delete().eq("id", r.id);
    if (error) {
      del.disabled = false;
      alert("Delete failed: " + error.message);
      return;
    }
    row.remove();
  });
  actions.appendChild(del);

  row.appendChild(actions);
  return row;
}

/* ---------- init ---------- */

refreshView();
