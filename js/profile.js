/* ==========================================================
   London Community Watch - Citizen Profile Portal
   ========================================================== */

"use strict";

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let authState = "signin"; // "signin" or "signup"

/* ---------- 1. AUTH DOM CONTROL ---------- */

const authSection = document.getElementById("auth-section");
const portalSection = document.getElementById("portal-section");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authBtnText = document.getElementById("btn-text");
const toggleAuthLink = document.getElementById("toggle-auth-state");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusContainer = document.getElementById("status-container");

const nicknameGroup = document.getElementById("nickname-group");
const nicknameInput = document.getElementById("nickname");

// Toggle Sign In vs Sign Up forms
toggleAuthLink.addEventListener("click", (e) => {
  e.preventDefault();
  clearStatus();
  if (authState === "signin") {
    authState = "signup";
    authTitle.textContent = "Create Account";
    authSubtitle.textContent = "Sign up to register as a verified citizen and track your reports.";
    authBtnText.textContent = "Sign Up";
    toggleAuthLink.textContent = "Already have an account? Sign in";
    if (nicknameGroup) nicknameGroup.style.display = "block";
  } else {
    authState = "signin";
    authTitle.textContent = "Citizen Portal";
    authSubtitle.textContent = "Sign in to track your reports and customize notifications.";
    authBtnText.textContent = "Sign In";
    toggleAuthLink.textContent = "Don't have an account? Sign up";
    if (nicknameGroup) nicknameGroup.style.display = "none";
  }
});

// Toggle password visibility
const togglePasswordBtn = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("eye-icon");
if (togglePasswordBtn && eyeIcon) {
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
}

/* ---------- 2. AUTHENTICATION LOGIC ---------- */

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    return showStatus("Please fill in all fields.", "err");
  }

  const btn = document.getElementById("auth-btn");
  btn.disabled = true;
  const originalText = authBtnText.textContent;
  authBtnText.innerHTML = `<span class="btn-spinner"></span> Processing…`;

  try {
    if (authState === "signin") {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Save email for topbar chip
      localStorage.setItem("lcw_email", email);
    } else {
      const nickname = nicknameInput ? nicknameInput.value.trim() : "";
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      
      // Save nickname + email for topbar chip
      localStorage.setItem("lcw_email", email);
      if (nickname) localStorage.setItem("lcw_nickname", nickname);

      // If sign up doesn't auto-confirm
      if (data && data.user && data.session === null) {
        showStatus("Registration successful! Please check your email inbox to confirm your account.", "ok");
        authForm.reset();
        btn.disabled = false;
        authBtnText.textContent = originalText;
        return;
      }
    }
  } catch (err) {
    console.error(err);
    showStatus(err.message || "Authentication failed. Please check credentials.", "err");
    btn.disabled = false;
    authBtnText.textContent = originalText;
  }
});

// Sign Out
document.getElementById("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  // Clear stored user data
  localStorage.removeItem("lcw_email");
  localStorage.removeItem("lcw_nickname");
  window.location.reload();
});

/* ---------- 3. UTILITIES & BANNERS ---------- */

function showStatus(msg, type = "") {
  statusContainer.innerHTML = `
    <div class="status-card ${type}">
      <svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${type === "err" 
          ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
          : '<polyline points="20 6 9 17 4 12"></polyline>'
        }
      </svg>
      <span>${msg}</span>
    </div>
  `;
}

function clearStatus() {
  statusContainer.innerHTML = "";
}

/* ---------- 4. NICKNAME EDITOR ---------- */

function refreshNicknameUI(nickname) {
  const displayEl = document.getElementById("nickname-display");
  const avatarEl  = document.getElementById("topbar-avatar");
  const chipNick  = document.getElementById("topbar-nickname");
  const sidebarAvatar = document.querySelector(".profile-avatar");
  const emailDisplay  = document.getElementById("user-email-display");

  if (displayEl) {
    if (nickname) {
      displayEl.textContent = nickname;
      displayEl.style.fontStyle = "normal";
      displayEl.style.color = "var(--text-primary)";
    } else {
      displayEl.textContent = "Not set";
      displayEl.style.fontStyle = "italic";
      displayEl.style.color = "var(--text-secondary)";
    }
  }

  // Update topbar chip
  const storedEmail = localStorage.getItem("lcw_email") || "";
  const display = nickname || storedEmail.split("@")[0] || "?";
  const initial = display.charAt(0).toUpperCase();
  if (avatarEl) avatarEl.textContent = initial;
  if (chipNick) chipNick.textContent = display;
  if (sidebarAvatar) sidebarAvatar.textContent = initial;
  if (emailDisplay) emailDisplay.textContent = nickname || storedEmail;
}

(function initNicknameEditor() {
  const saveBtn     = document.getElementById("save-nickname-btn");
  const editInput   = document.getElementById("nickname-edit-input");
  const statusLine  = document.getElementById("nickname-save-status");

  if (!saveBtn || !editInput) return;

  // Pre-fill with existing nickname
  const saved = localStorage.getItem("lcw_nickname") || "";
  editInput.value = saved;
  refreshNicknameUI(saved);

  saveBtn.addEventListener("click", () => {
    const val = editInput.value.trim();
    if (!val) {
      if (statusLine) { statusLine.textContent = "⚠️ Nickname cannot be empty."; statusLine.style.color = "var(--red)"; }
      return;
    }
    localStorage.setItem("lcw_nickname", val);
    refreshNicknameUI(val);
    editInput.value = val;
    if (statusLine) {
      statusLine.textContent = "✅ Nickname updated!";
      statusLine.style.color = "var(--green, #16a34a)";
      setTimeout(() => { statusLine.textContent = ""; }, 3000);
    }
  });

  // Allow Enter key to save
  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
  });
})();

function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ---------- 4. REPORTS HISTORY & SETTINGS ---------- */

const PROFILE_ITEMS_PER_PAGE = 4;
let currentProfilePage = 1;
let profileReports = [];

async function renderReportsHistory() {
  const listContainer = document.getElementById("reports-history-list");
  if (!listContainer) return;

  const myReports = JSON.parse(localStorage.getItem("my_reports") || "[]");
  document.getElementById("user-reports-count").textContent = myReports.length;

  const pagination = document.getElementById("profile-pagination");
  if (myReports.length === 0) {
    listContainer.innerHTML = `
      <div class="faq-alert alert-info" style="text-align: center; padding: 24px;">
        You have not submitted any reports yet. Find an issue near you, report it on the map, and your history will appear here automatically!
      </div>
    `;
    if (pagination) pagination.style.display = "none";
    return;
  }

  // Fetch reports details from Supabase
  const { data, error } = await db
    .from("reports")
    .select("*")
    .in("id", myReports)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user reports history:", error);
    listContainer.innerHTML = `<p class="hint text-orange" style="text-align: center;">Nu s-a putut încărca istoricul. Încercați din nou mai târziu.</p>`;
    if (pagination) pagination.style.display = "none";
    return;
  }

  if (data.length === 0) {
    listContainer.innerHTML = `
      <div class="faq-alert alert-info" style="text-align: center; padding: 24px;">
        Sesizările depuse anterior nu mai există sau au fost șterse de administratori ca fiind duplicate/spam.
      </div>
    `;
    if (pagination) pagination.style.display = "none";
    return;
  }

  profileReports = data;
  currentProfilePage = 1;
  displayProfileReportsPage();
}

function displayProfileReportsPage() {
  const listContainer = document.getElementById("reports-history-list");
  if (!listContainer) return;

  const totalPages = Math.ceil(profileReports.length / PROFILE_ITEMS_PER_PAGE) || 1;
  if (currentProfilePage < 1) currentProfilePage = 1;
  if (currentProfilePage > totalPages) currentProfilePage = totalPages;

  listContainer.innerHTML = "";
  
  // Slice reports for current page
  const start = (currentProfilePage - 1) * PROFILE_ITEMS_PER_PAGE;
  const end = start + PROFILE_ITEMS_PER_PAGE;
  const pageReports = profileReports.slice(start, end);

  let html = `<div class="profile-reports-list">`;
  pageReports.forEach(r => {
    const age = timeAgo(r.created_at);
    const desc = r.description;
    const swatchColor = CONFIG.CATEGORY_COLORS[r.category] || "#6C6C6C";

    let statusClass = "reported";
    let statusLabel = "Reported";
    if (r.status === "in progress") {
      statusClass = "in-progress";
      statusLabel = "In Progress";
    } else if (r.status === "resolved") {
      statusClass = "resolved";
      statusLabel = "Resolved";
    }

    html += `
      <div class="profile-report-row">
        <div class="pr-left">
          <div class="pr-cat-row">
            <span class="swatch" style="background: ${swatchColor}; width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px;"></span>
            <strong class="pr-cat-text">${r.category}</strong>
            <span class="badge ${statusClass}">${statusLabel}</span>
          </div>
          <p class="pr-desc">${desc}</p>
          <div class="pr-meta">
            <span>Submitted: ${age}</span>
            <span>&bull;</span>
            <span>Confirmations: ${r.confirmations || 0}</span>
          </div>
        </div>
        <div class="pr-right">
          <a href="index.html?report=${r.id}" class="btn-secondary pr-map-btn" title="View on map">View on Map</a>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  listContainer.innerHTML = html;

  // Pagination bar sync
  const pagination = document.getElementById("profile-pagination");
  if (pagination) {
    if (profileReports.length > PROFILE_ITEMS_PER_PAGE) {
      pagination.style.display = "flex";
      document.getElementById("profile-page-indicator").textContent = `Page ${currentProfilePage} of ${totalPages}`;
      document.getElementById("btn-prev-profile").disabled = currentProfilePage === 1;
      document.getElementById("btn-next-profile").disabled = currentProfilePage === totalPages;
    } else {
      pagination.style.display = "none";
    }
  }
}

// Pagination controls clicks
document.getElementById("btn-prev-profile").addEventListener("click", () => {
  if (currentProfilePage > 1) {
    currentProfilePage--;
    displayProfileReportsPage();
  }
});

document.getElementById("btn-next-profile").addEventListener("click", () => {
  const totalPages = Math.ceil(profileReports.length / PROFILE_ITEMS_PER_PAGE) || 1;
  if (currentProfilePage < totalPages) {
    currentProfilePage++;
    displayProfileReportsPage();
  }
});

// Bind email notifications checkbox toggle to localStorage mock configurations
const notifToggle = document.getElementById("email-notif-toggle");
if (notifToggle) {
  // Load initial settings
  const isEnabled = localStorage.getItem("email_notifications_enabled") !== "false"; // default true
  notifToggle.checked = isEnabled;

  notifToggle.addEventListener("change", () => {
    localStorage.setItem("email_notifications_enabled", notifToggle.checked);
  });
}

/* ---------- 5. AUTH STATE LISTENER ---------- */

db.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    // Logged in
    authSection.style.display = "none";
    portalSection.style.display = "block";

    // Save email for topbar chip on all pages
    localStorage.setItem("lcw_email", session.user.email);

    // Show nickname in profile sidebar
    const savedNickname = localStorage.getItem("lcw_nickname");

    // Refresh all nickname-dependent UI in one call
    refreshNicknameUI(savedNickname);

    // Update topbar chip visibility
    const chip = document.getElementById("topbar-user");
    if (chip) chip.style.display = "flex";

    renderReportsHistory();
  } else {
    // Guest
    authSection.style.display = "block";
    portalSection.style.display = "none";

    // Hide chip
    const chip = document.getElementById("topbar-user");
    if (chip) chip.style.display = "none";
  }
});
