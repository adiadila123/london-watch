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
  const card = document.getElementById("login-status-card");
  const text = document.getElementById("login-status-text");
  
  if (!msg) {
    card.hidden = true;
    card.className = "status-card";
    text.textContent = "";
    return;
  }

  text.textContent = msg;
  card.className = `status-card ${cls || ""}`;
  card.hidden = false;
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

// Toggle password visibility
const togglePasswordBtn = document.getElementById("toggle-password");
const passwordInput = document.getElementById("password");
const eyeIcon = document.getElementById("eye-icon");

togglePasswordBtn.addEventListener("click", () => {
  const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);
  
  // Update SVG icon
  if (type === "text") {
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
    togglePasswordBtn.setAttribute("aria-label", "Hide password");
  } else {
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
    togglePasswordBtn.setAttribute("aria-label", "Show password");
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const emailInput = document.getElementById("email");
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const loginBtn = document.getElementById("login-btn");
  const btnText = document.getElementById("login-btn-text");
  const spinner = document.getElementById("login-spinner");

  // Email format regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !password) {
    return setLoginStatus("Please enter both email and password.", "err");
  }

  if (!emailRegex.test(email)) {
    return setLoginStatus("Please enter a valid email address.", "err");
  }

  // Set loading state
  setLoginStatus("");
  emailInput.disabled = true;
  passwordInput.disabled = true;
  loginBtn.disabled = true;
  btnText.textContent = "Signing in...";
  spinner.hidden = false;

  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginStatus(error.message, "err");
      // Re-enable fields
      emailInput.disabled = false;
      passwordInput.disabled = false;
      loginBtn.disabled = false;
      btnText.textContent = "Sign in";
      spinner.hidden = true;
      return;
    }
    
    // Clear login fields upon successful login
    emailInput.value = "";
    passwordInput.value = "";
    emailInput.disabled = false;
    passwordInput.disabled = false;
    loginBtn.disabled = false;
    btnText.textContent = "Sign in";
    spinner.hidden = true;
    
    refreshView();
  } catch (err) {
    setLoginStatus("An unexpected error occurred. Please try again.", "err");
    emailInput.disabled = false;
    passwordInput.disabled = false;
    loginBtn.disabled = false;
    btnText.textContent = "Sign in";
    spinner.hidden = true;
  }
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

const ITEMS_PER_PAGE = 8;
let currentPage = 1;
let allReports = [];

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

  allReports = data;
  currentPage = 1;
  displayCurrentPage();
}

function displayCurrentPage() {
  const list = document.getElementById("report-list");
  if (!list) return;

  const totalPages = Math.ceil(allReports.length / ITEMS_PER_PAGE) || 1;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  document.getElementById("report-count").textContent =
    `${allReports.length} report${allReports.length === 1 ? "" : "s"}`;

  const paginationControls = document.getElementById("pagination-controls");
  if (allReports.length === 0) {
    list.innerHTML = '<p class="hint">No reports yet.</p>';
    if (paginationControls) paginationControls.style.display = "none";
    return;
  }

  list.innerHTML = "";
  
  // Slice reports for the current page
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageReports = allReports.slice(start, end);

  pageReports.forEach((r) => list.appendChild(buildRow(r)));

  // Setup pagination bar state
  if (paginationControls) {
    if (allReports.length > ITEMS_PER_PAGE) {
      paginationControls.style.display = "flex";
      document.getElementById("page-indicator").textContent = `Page ${currentPage} of ${totalPages}`;
      document.getElementById("btn-prev-page").disabled = currentPage === 1;
      document.getElementById("btn-next-page").disabled = currentPage === totalPages;
    } else {
      paginationControls.style.display = "none";
    }
  }
}

// Pagination button event listeners
document.getElementById("btn-prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    displayCurrentPage();
  }
});

document.getElementById("btn-next-page").addEventListener("click", () => {
  const totalPages = Math.ceil(allReports.length / ITEMS_PER_PAGE) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    displayCurrentPage();
  }
});

function buildRow(r) {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.style.cursor = "pointer"; // visual cue that the row is clickable

  // Open modal when row clicked
  row.addEventListener("click", () => openReportModal(r));

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
  select.addEventListener("click", (e) => e.stopPropagation()); // prevent row modal triggering
  select.addEventListener("change", async (e) => {
    select.disabled = true;
    const { error } = await db.from("reports")
      .update({ status: select.value })
      .eq("id", r.id);
    select.disabled = false;
    if (error) {
      alert("Update failed: " + error.message);
    } else {
      // update status in the local array so details modal has latest status
      const item = allReports.find(item => item.id === r.id);
      if (item) item.status = select.value;
    }
  });
  actions.appendChild(select);

  const del = document.createElement("button");
  del.className = "btn-danger";
  del.textContent = "Delete";
  del.addEventListener("click", async (e) => {
    e.stopPropagation(); // prevent row modal triggering
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
    
    // Remove from local array and re-draw page
    allReports = allReports.filter(item => item.id !== r.id);
    displayCurrentPage();
  });
  actions.appendChild(del);

  row.appendChild(actions);
  return row;
}

/* ---------- REPORT DETAILS MODAL LOGIC ---------- */

function openReportModal(r) {
  const modal = document.getElementById("report-modal");
  const modalImg = document.getElementById("modal-image-container");
  const modalDesc = document.getElementById("modal-desc");
  const modalDate = document.getElementById("modal-date");
  const modalConfs = document.getElementById("modal-confirmations");
  const modalCoords = document.getElementById("modal-coords");
  const modalMapLink = document.getElementById("modal-map-link-wrap");
  const modalCategory = document.getElementById("modal-category");

  modalCategory.textContent = r.category;
  modalDesc.textContent = r.description;
  modalDate.textContent = new Date(r.created_at).toLocaleString("en-GB");
  modalConfs.textContent = `${r.confirmations} confirmation${r.confirmations === 1 ? "" : "s"}`;
  modalCoords.textContent = `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`;

  if (r.photo_url) {
    modalImg.innerHTML = `<img src="${r.photo_url}" alt="Report Photo" style="width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px;">`;
    modalImg.style.display = "block";
  } else {
    modalImg.style.display = "none";
  }

  // Link to main application map page with the report zoom query parameter
  modalMapLink.innerHTML = `
    <a href="index.html?report=${r.id}" class="btn-secondary" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; text-decoration: none; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-primary);">
      📍 Locate on Map
    </a>
  `;

  modal.style.display = "flex";
}

// Close modal handlers
document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("report-modal").style.display = "none";
});

document.getElementById("report-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("report-modal")) {
    document.getElementById("report-modal").style.display = "none";
  }
});

/* ---------- init ---------- */

refreshView();
