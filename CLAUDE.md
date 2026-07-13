# London Community Watch — CLAUDE.md

Aplicație de raportare civică pentru Londra. Vanilla JS + Leaflet + Supabase, fără bundler, fără framework, deploy pe Netlify din GitHub.

## Reguli stricte

**Nu modifica niciodată `js/config.js`.** Fișierul conține cheile Supabase (URL + anon key) și configurația hărții. Este versionat intenționat; orice schimbare a cheilor se face manual, direct în fișier, de către utilizator.

**Când modifici fișiere din shell-ul aplicației (HTML, CSS, JS, manifest, icoane), incrementează versiunea cache-ului din `sw.js`** — linia `const CACHE = "lcw-vN"`. Shell-ul curent: `lcw-v1`. Dacă nu crești versiunea, utilizatorii cu PWA instalat nu vor vedea schimbările.

## Server local

```
python3 -m http.server 8000
```

Aplicația rulează la `http://localhost:8000`. Nu există build step, nu există `npm install`.

## Structura proiectului

```
index.html          # Pagina principală: hartă + formular de raportare
dashboard.html      # Analytics: KPI-uri, grafice Chart.js
admin.html          # Panou admin: schimbare status, ștergere rapoarte
profile.html        # Profilul utilizatorului
help.html           # FAQ / ajutor
css/styles.css      # Tot CSS-ul aplicației
js/config.js        # !! NU MODIFICA !! — chei Supabase + configurație
js/app.js           # Logica principală (hartă, clustere, formular, realtime)
js/dashboard.js     # Grafice și agregări statistice
js/admin.js         # Autentificare admin + operații CRUD
js/profile.js       # Logica paginii de profil
sw.js               # Service worker (network-first, cache fallback)
manifest.webmanifest
supabase-setup.sql  # Schema inițială Supabase
supabase-upgrade.sql # Migrații + politici RLS
icons/              # icon-192.png, icon-512.png, apple-touch-icon.png
```

## Stack

- **Leaflet 1.9.4** + **leaflet.markercluster 1.5.3** — harta și clusterele de markere (fără API key)
- **OpenStreetMap** tiles pentru street view, **ArcGIS World Imagery** pentru satelit
- **Supabase** (JS CDN) — baza de date PostgreSQL, Storage pentru poze, autentificare admin, Realtime
- **Chart.js** (CDN) — graficele din dashboard
- **PWA** — service worker network-first cu cache fallback pentru shell

## Categorii de rapoarte

`Roads & Pavements`, `Fly-tipping & Litter`, `Street Lighting`, `Parks & Green Spaces`, `Public Transport`, `Other` — culorile sunt definite în `CONFIG.CATEGORY_COLORS` din `js/config.js`.

## Supabase

- Clientul se inițializează în fiecare pagină JS cu `supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)`.
- Bucket Storage: `report-photos`, limită foto: 5 MB (comprimate client-side în `app.js`).
- Politicile RLS sunt definite în `supabase-upgrade.sql`.
- Admin-ul se autentifică cu email/parolă prin Supabase Auth.

## Deploy

Push pe `main` → Netlify deploy automat. Nu există configurație de build în Netlify (site static pur).

## Service worker — când să crești versiunea

Crește `lcw-vN` din `sw.js` ori de câte ori modifici oricare dintre fișierele din `SHELL`:
`index.html`, `css/styles.css`, `js/config.js`, `js/app.js`, `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png`.

Nu crești versiunea pentru: `dashboard.html`, `admin.html`, `profile.html`, `help.html`, JS-urile lor, sau fișiere care nu sunt în shell-ul PWA.
