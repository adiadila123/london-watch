/* ==========================================================
   London Community Watch - application logic
   Sections:
     1. Setup (Supabase client, map, draft pin, locate control)
     2. State + helpers
     3. Popup builder
     4. Rendering (markers + feed)
     5. Data (initial load + realtime)
     6. Form submission (photo upload + insert)
   ========================================================== */

"use strict";

/* ---------- 1. SETUP ---------- */

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const bounds = L.latLngBounds(CONFIG.LONDON_BOUNDS);
const map = L.map("map", { maxBounds: bounds, maxBoundsViscosity: 0.8 })
  .setView(CONFIG.LONDON_CENTER, CONFIG.LONDON_ZOOM);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

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

// Click anywhere on the map to (re)place the pin.
map.on("click", (e) => placeDraftMarker(e.latlng));

function locateUser() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const here = [pos.coords.latitude, pos.coords.longitude];
      // Only use the GPS fix if it is actually in London.
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

// Small "locate me" button under the zoom controls, so users who
// refused GPS at first can trigger it again later.
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

// Ask for GPS once on load.
locateUser();

/* ---------- 2. STATE + HELPERS ---------- */

// id -> { data, marker }  keeps everything in sync (map, feed, realtime)
const reports = new Map();

// Remember which reports THIS browser already confirmed (soft limit -
// there is no login, so this only prevents accidental double-taps).
const confirmed = new Set(JSON.parse(localStorage.getItem("confirmed") || "[]"));

function rememberConfirmed(id) {
  confirmed.add(id);
  localStorage.setItem("confirmed", JSON.stringify([...confirmed]));
}

// Never inject user text as raw HTML.
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

/* ---------- 3. POPUP (rebuilt on every open so counts stay current) ---------- */

function popupContent(id) {
  const r = reports.get(id)?.data;
  if (!r) return "Report not found.";

  const wrap = document.createElement("div");
  wrap.innerHTML =
    `<div class="popup-cat">${escapeHtml(r.category)}</div>` +
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
    r.confirmations = data;          // instant local update
    rememberConfirmed(id);
    btn.textContent = `Confirmed \u2713 (${data})`;
    renderFeed();
  });

  wrap.appendChild(btn);
  return wrap;
}

/* ---------- 4. RENDERING ---------- */

function addReportToMap(r) {
  if (reports.has(r.id)) return;
  const marker = L.marker([r.lat, r.lng], { icon: dotIcon(r.category) }).addTo(map);
  marker.bindPopup(() => popupContent(r.id), { maxWidth: 260 });
  reports.set(r.id, { data: r, marker });
}

function renderFeed() {
  const feed = document.getElementById("feed");
  const latest = [...reports.values()]
    .sort((a, b) => new Date(b.data.created_at) - new Date(a.data.created_at))
    .slice(0, 10);

  if (latest.length === 0) {
    feed.innerHTML = '<p class="hint">No reports yet - be the first!</p>';
    return;
  }

  feed.innerHTML = "";
  for (const { data: r } of latest) {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML =
      `<div><div class="feed-cat">${escapeHtml(r.category)}</div>` +
      `<div class="feed-desc">${escapeHtml(r.description.slice(0, 60))}</div></div>` +
      `<span class="feed-count">${r.confirmations} \u2713</span>`;
    // Tap a feed item -> fly to it and open its popup.
    item.addEventListener("click", () => {
      map.setView([r.lat, r.lng], 17);
      reports.get(r.id).marker.openPopup();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    feed.appendChild(item);
  }
}

/* ---------- 5. DATA: initial load + realtime ---------- */

async function loadReports() {
  const { data, error } = await db
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);                       // plenty for an MVP

  if (error) {
    document.getElementById("feed").innerHTML =
      '<p class="hint">Could not load reports. Check your Supabase keys in js/config.js.</p>';
    console.error(error);
    return;
  }
  data.forEach(addReportToMap);
  renderFeed();
}

db.channel("reports-live")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, (payload) => {
    addReportToMap(payload.new);
    renderFeed();
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports" }, (payload) => {
    const entry = reports.get(payload.new.id);
    if (entry) {
      entry.data = payload.new;
      // If this report's popup is open, rebuild it with the new count.
      if (entry.marker.isPopupOpen()) entry.marker.setPopupContent(popupContent(payload.new.id));
    }
    renderFeed();
  })
  .subscribe();

/* ---------- 6. FORM SUBMISSION ---------- */

const photoInput = document.getElementById("photo");

document.getElementById("photo-btn").addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", () => {
  document.getElementById("file-name").textContent =
    photoInput.files[0] ? photoInput.files[0].name : "No photo selected";
});

async function uploadPhoto(file) {
  // Unique name so uploads never collide: <uuid>.<extension>
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage.from(CONFIG.BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false
  });
  if (error) throw error;

  // The bucket is public, so this URL works without a token.
  return db.storage.from(CONFIG.BUCKET).getPublicUrl(path).data.publicUrl;
}

document.getElementById("submit-btn").addEventListener("click", async () => {
  const category = document.getElementById("category").value;
  const description = document.getElementById("description").value.trim();
  const file = photoInput.files[0] || null;
  const maxBytes = CONFIG.MAX_PHOTO_MB * 1024 * 1024;

  // ---- validation ----
  if (!draftMarker)           return setStatus("Tap the map to place the pin first.", "err");
  if (!category)              return setStatus("Please choose a category.", "err");
  if (description.length < 3) return setStatus("Please add a short description.", "err");
  if (file && file.size > maxBytes)
    return setStatus(`Photo is over ${CONFIG.MAX_PHOTO_MB} MB - please pick a smaller one.`, "err");

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  setStatus("Sending\u2026");

  try {
    let photo_url = null;
    if (file) {
      setStatus("Uploading photo\u2026");
      photo_url = await uploadPhoto(file);
    }

    const { lat, lng } = draftMarker.getLatLng();
    const { data, error } = await db.from("reports").insert({
      category, description, photo_url, lat, lng
    }).select().single();
    if (error) throw error;

    // Draw it immediately (realtime also fires, but addReportToMap
    // de-duplicates by id, so nothing appears twice).
    addReportToMap(data);
    renderFeed();

    // Reset the form.
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

/* ==========================================================
   FUTURE FEATURES - where to plug them in:
   - CSV export: loop over `reports` values and build a data: URI
   - Category filters: marker.setOpacity() over reports.forEach
   - Status field (fixed / in progress): SQL column + popup badge
   ========================================================== */

loadReports();
