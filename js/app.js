/* ==========================================================
   London Community Watch - application logic (v3)
   Sections:
     1. Setup (Supabase, map, clustering, draft pin, locate)
     2. State + helpers (incl. timeAgo, image compression)
     3. Category filters
     4. Popup builder
     5. Rendering (markers + feed)
     6. Data (initial load + realtime, incl. DELETE)
     7. Form submission
     8. PWA service worker registration
   ========================================================== */

"use strict";

/* ---------- 1. SETUP ---------- */

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const bounds = L.latLngBounds(CONFIG.LONDON_BOUNDS);
const map = L.map("map", { maxBounds: bounds, maxBoundsViscosity: 0.8 })
  .setView(CONFIG.LONDON_CENTER, CONFIG.LONDON_ZOOM);

const streetLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Add standard street layer by default
streetLayer.addTo(map);

// All report markers live in a cluster group: nearby dots merge into
// numbered bubbles, which keeps the map readable and fast at scale.
const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 50,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true
});
clusterGroup.addTo(map);

// Initialize the heatmap overlay layer (Leaflet.heat)
const heatLayer = L.heatLayer([], { radius: 25, blur: 15, max: 1.0 });
heatLayer.addTo(map);

// Add layer switcher control (both base layers and overlays)
const baseMaps = {
  "Street Map": streetLayer,
  "Satellite": satelliteLayer
};
const overlays = {
  "Markers (Clusters)": clusterGroup,
  "Heatmap (Density)": heatLayer
};
L.control.layers(baseMaps, overlays, { position: "topright" }).addTo(map);

// Draggable red pin marking WHERE the new report is.
let draftMarker = null;

function placeDraftMarker(latlng) {
  if (draftMarker) {
    draftMarker.setLatLng(latlng);
  } else {
    draftMarker = L.marker(latlng, { draggable: true, zIndexOffset: 1000 }).addTo(map);
    draftMarker.bindTooltip("Your report location (drag me)", { direction: "top" });
  }
}

map.on("click", (e) => placeDraftMarker(e.latlng));

function locateUser() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const here = [pos.coords.latitude, pos.coords.longitude];
      if (bounds.contains(here)) {
        map.setView(here, 16);
        placeDraftMarker(here);
        document.getElementById("location-hint").textContent =
          "Pin placed at your location. Drag it to adjust if needed.";
      }
    },
    () => { /* permission denied - user taps the map instead */ },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

const LocateControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const btn = L.DomUtil.create("button", "locate-btn");
    btn.type = "button";
    btn.title = "Centre map on my location";
    btn.setAttribute("aria-label", "Centre map on my location");
    btn.textContent = "\u25CE"; // ◎
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      locateUser();
    });
    return btn;
  }
});
map.addControl(new LocateControl());

locateUser();

/* ---------- 2. STATE + HELPERS ---------- */

// id -> { data, marker }
const reports = new Map();

// Categories currently visible (all on by default).
const activeCategories = new Set(Object.keys(CONFIG.CATEGORY_COLORS));

const confirmed = new Set(JSON.parse(localStorage.getItem("confirmed") || "[]"));

function rememberConfirmed(id) {
  confirmed.add(id);
  localStorage.setItem("confirmed", JSON.stringify([...confirmed]));
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function setStatus(msg, cls) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = cls || "";
}

function dotIcon(category) {
  const color = CONFIG.CATEGORY_COLORS[category] || CONFIG.CATEGORY_COLORS["Other"];
  return L.divIcon({
    className: "",
    html: `<div class="dot-marker" style="background:${color}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// "2h ago" style relative time.
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Status -> CSS badge class ("in progress" -> "in-progress")
function badgeHtml(status) {
  const st = status || "reported";
  return `<span class="badge ${st.replace(" ", "-")}">${escapeHtml(st)}</span>`;
}

// Shrink photos client-side before upload: max 1280px on the long
// edge, JPEG q0.8. A 5 MB phone photo becomes ~200-400 KB. If the
// browser cannot decode the format (e.g. HEIC on Chrome), we fall
// back to uploading the original file untouched.
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    if (blob && blob.size < file.size) {
      return new File([blob], "photo.jpg", { type: "image/jpeg" });
    }
    return file;
  } catch {
    return file;
  }
}

/* ---------- 3. CATEGORY FILTERS ---------- */

function buildFilterChips() {
  const wrap = document.getElementById("filters");
  wrap.innerHTML = "";
  for (const [cat, color] of Object.entries(CONFIG.CATEGORY_COLORS)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("aria-pressed", "true");
    chip.innerHTML = `<span class="swatch" style="background:${color}"></span>${escapeHtml(cat)}`;
    chip.addEventListener("click", () => {
      if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        chip.classList.add("off");
        chip.setAttribute("aria-pressed", "false");
      } else {
        activeCategories.add(cat);
        chip.classList.remove("off");
        chip.setAttribute("aria-pressed", "true");
      }
      applyFilters();
    });
    wrap.appendChild(chip);
  }
}

// Rebuild the cluster layer with only the active categories.
function applyFilters() {
  clusterGroup.clearLayers();
  for (const { data, marker } of reports.values()) {
    if (activeCategories.has(data.category)) clusterGroup.addLayer(marker);
  }
  renderFeed();
}

/* ---------- 4. POPUP (rebuilt on every open so counts stay current) ---------- */

function popupContent(id) {
  const r = reports.get(id)?.data;
  if (!r) return "Report not found.";

  const wrap = document.createElement("div");
  wrap.innerHTML =
    `<div class="popup-cat">${escapeHtml(r.category)} ${badgeHtml(r.status)}</div>` +
    `<div class="popup-meta">${timeAgo(r.created_at)}</div>` +
    (r.photo_url ? `<img class="popup-photo" src="${escapeHtml(r.photo_url)}" alt="Report photo" loading="lazy">` : "") +
    `<div class="popup-desc">${escapeHtml(r.description)}</div>`;

  const btn = document.createElement("button");
  btn.className = "popup-confirm";
  const done = confirmed.has(id);
  btn.textContent = done
    ? `Confirmed \u2713 (${r.confirmations})`
    : `Confirm (${r.confirmations})`;
  btn.disabled = done;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const { data, error } = await db.rpc("increment_confirmations", { report_id: id });
    if (error) {
      btn.disabled = false;
      btn.textContent = "Error - try again";
      return;
    }
    r.confirmations = data;
    rememberConfirmed(id);
    btn.textContent = `Confirmed \u2713 (${data})`;
    renderFeed();
  });

  wrap.appendChild(btn);
  return wrap;
}

/* ---------- 5. RENDERING ---------- */

function addReportToMap(r) {
  if (reports.has(r.id)) return;
  const marker = L.marker([r.lat, r.lng], { icon: dotIcon(r.category) });
  marker.bindPopup(() => popupContent(r.id), { maxWidth: 260 });
  reports.set(r.id, { data: r, marker });
  if (activeCategories.has(r.category)) clusterGroup.addLayer(marker);
}

function removeReport(id) {
  const entry = reports.get(id);
  if (!entry) return;
  clusterGroup.removeLayer(entry.marker);
  reports.delete(id);
  renderFeed();
}

function renderFeed() {
  const feed = document.getElementById("feed");
  const latest = [...reports.values()]
    .filter(({ data }) => activeCategories.has(data.category))
    .sort((a, b) => new Date(b.data.created_at) - new Date(a.data.created_at))
    .slice(0, 10);

  if (latest.length === 0) {
    feed.innerHTML = '<p class="hint">No reports here yet - be the first!</p>';
    return;
  }

  feed.innerHTML = "";
  for (const { data: r, marker } of latest) {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML =
      `<div><div class="feed-cat">${escapeHtml(r.category)} ${badgeHtml(r.status)}</div>` +
      `<div class="feed-desc">${escapeHtml(r.description.slice(0, 60))}</div>` +
      `<div class="feed-meta">${timeAgo(r.created_at)}</div></div>` +
      `<span class="feed-count">${r.confirmations} \u2713</span>`;
    item.addEventListener("click", () => {
      map.setView([r.lat, r.lng], 17);
      // zoomToShowLayer un-clusters the marker before opening its popup
      clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    feed.appendChild(item);
  }
}

/* ---------- 6. DATA: initial load + realtime ---------- */

function updateHeatmap() {
  const points = [];
  for (const { data } of reports.values()) {
    points.push([data.lat, data.lng, 1.0]);
  }
  heatLayer.setLatLngs(points);
}

function updateTicker() {
  const tickerText = document.getElementById("ticker-text");
  if (!tickerText) return;

  const sortedReports = [...reports.values()]
    .map(entry => entry.data)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  if (sortedReports.length === 0) {
    tickerText.innerHTML = `<span class="ticker-item">No recent activity. Submitting reports will pop here live!</span>`;
    return;
  }

  const items = sortedReports.map(r => {
    const age = timeAgo(r.created_at);
    const desc = r.description ? `"${r.description.slice(0, 40)}${r.description.length > 40 ? '...' : ''}"` : '';
    
    let icon = "📢";
    let statusText = "reported";
    if (r.status === "resolved") {
      icon = "✅";
      statusText = "resolved";
    } else if (r.status === "in progress") {
      icon = "🚧";
      statusText = "in progress";
    }
    
    return `<span class="ticker-item">${icon} <strong>${r.category}</strong> ${statusText} ${age} ${desc ? `- ${desc}` : ''}</span>`;
  });

  tickerText.innerHTML = items.join(" &nbsp;&bull;&nbsp; ");
}

async function loadReports() {
  const { data, error } = await db
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    document.getElementById("feed").innerHTML =
      '<p class="hint">Could not load reports. Check your Supabase keys in js/config.js.</p>';
    console.error(error);
    return;
  }
  data.forEach(addReportToMap);
  renderFeed();
  updateHeatmap();
  updateTicker();

  // Handle direct linking to a report
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get("report");
  if (reportId) {
    const entry = reports.get(reportId);
    if (entry) {
      clusterGroup.zoomToShowLayer(entry.marker, () => {
        entry.marker.openPopup();
      });
    }
  }
}

db.channel("reports-live")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, (payload) => {
    addReportToMap(payload.new);
    renderFeed();
    updateHeatmap();
    updateTicker();
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports" }, (payload) => {
    const entry = reports.get(payload.new.id);
    if (entry) {
      entry.data = payload.new;
      if (entry.marker.isPopupOpen()) entry.marker.setPopupContent(popupContent(payload.new.id));
    }
    renderFeed();
    updateHeatmap();
    updateTicker();
  })
  .on("postgres_changes", { event: "DELETE", schema: "public", table: "reports" }, (payload) => {
    // Fired when the admin removes spam - the marker vanishes live.
    removeReport(payload.old.id);
    updateHeatmap();
    updateTicker();
  })
  .subscribe();

/* ---------- 7. FORM SUBMISSION ---------- */

const photoInput = document.getElementById("photo");

document.getElementById("photo-btn").addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", () => {
  document.getElementById("file-name").textContent =
    photoInput.files[0] ? photoInput.files[0].name : "No photo selected";
});

async function uploadPhoto(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage.from(CONFIG.BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false
  });
  if (error) throw error;

  return db.storage.from(CONFIG.BUCKET).getPublicUrl(path).data.publicUrl;
}

document.getElementById("submit-btn").addEventListener("click", async () => {
  const category = document.getElementById("category").value;
  const description = document.getElementById("description").value.trim();
  const rawFile = photoInput.files[0] || null;

  // ---- validation ----
  if (!draftMarker)           return setStatus("Tap the map to place the pin first.", "err");
  if (!category)              return setStatus("Please choose a category.", "err");
  if (description.length < 3) return setStatus("Please add a short description.", "err");

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  setStatus("Sending\u2026");

  try {
    let photo_url = null;
    if (rawFile) {
      setStatus("Preparing photo\u2026");
      const file = await compressImage(rawFile);
      const maxBytes = CONFIG.MAX_PHOTO_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`Photo is over ${CONFIG.MAX_PHOTO_MB} MB even after compression - please pick a smaller one.`);
      }
      setStatus("Uploading photo\u2026");
      photo_url = await uploadPhoto(file);
    }

    const { lat, lng } = draftMarker.getLatLng();
    const { data, error } = await db.from("reports").insert({
      category, description, photo_url, lat, lng
    }).select().single();
    if (error) throw error;

    // Save report ID to localStorage for profile tracking
    const myReports = JSON.parse(localStorage.getItem("my_reports") || "[]");
    myReports.push(data.id);
    localStorage.setItem("my_reports", JSON.stringify(myReports));

    addReportToMap(data);
    renderFeed();
    updateHeatmap();
    updateTicker();

    document.getElementById("category").selectedIndex = 0;
    document.getElementById("description").value = "";
    photoInput.value = "";
    document.getElementById("file-name").textContent = "No photo selected";
    setStatus("Report submitted. Thank you!", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong: " + (err.message || "unknown error"), "err");
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 8. PWA ---------- */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    /* SW is progressive enhancement - the app works fine without it */
  });
}

/* ---------- init ---------- */

buildFilterChips();
loadReports();
