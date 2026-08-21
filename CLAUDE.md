# London Community Watch — CLAUDE.md

Aplicație de raportare civică pentru Londra. Vanilla JS + Leaflet pe frontend, Flask + SQLite pe backend, fără bundler, fără framework frontend. Rulează local; deploy-ul nu e configurat încă.

## Reguli stricte

**Nu comite niciodată `server/.env` sau `server/lcw.db`.** Primul conține `SECRET_KEY`/`VOTER_HASH_SALT`, al doilea conține parolele hash-uite ale utilizatorilor. Ambele sunt deja în `.gitignore` — nu le adăuga manual la commit.

**Când modifici fișiere din shell-ul aplicației (HTML, CSS, JS, manifest, icoane), incrementează versiunea cache-ului din `sw.js`** — linia `const CACHE = "lcw-vN"`. Shell-ul curent: `lcw-v8`. Dacă nu crești versiunea, utilizatorii cu PWA instalat nu vor vedea schimbările.

## Server local

```
pip install -r server/requirements.txt
cp server/.env.example server/.env   # completează SECRET_KEY și VOTER_HASH_SALT
flask --app server/app.py create-admin tu@example.com parola-ta   # o singură dată
python server/app.py
```

Aplicația rulează la `http://localhost:5050` (Flask servește atât frontend-ul, cât și API-ul, pe același port — nu mai există `python3 -m http.server` separat). Nu există build step, nu există `npm install`.

## Structura proiectului

```
index.html          # Pagina principală: hartă + formular de raportare
dashboard.html      # Analytics: KPI-uri, grafice Chart.js
admin.html          # Panou admin: schimbare status, ștergere rapoarte
profile.html        # Profilul utilizatorului
help.html           # FAQ / ajutor
css/styles.css      # Tot CSS-ul aplicației
js/config.js        # Configurație client (culori categorii, limită foto, centru hartă)
js/app.js           # Logica principală (hartă, clustere, formular, polling)
js/dashboard.js     # Grafice și agregări statistice
js/admin.js         # Autentificare admin + operații CRUD
js/profile.js       # Logica paginii de profil (autentificare cetățean)
sw.js               # Service worker (network-first, cache fallback)
manifest.webmanifest
server/
  app.py             # Aplicația Flask: rutele API + servirea fișierelor statice
  db.py              # Helper SQLite: hash IP, rate-limit, dedup confirmări
  schema.sql         # Schema SQLite (reports, confirmations, report_rate_limits, users)
  requirements.txt
  .env.example       # Șablon pentru SECRET_KEY / VOTER_HASH_SALT / MAX_REPORTS_PER_HOUR
uploads/             # Poze încărcate de utilizatori (negestionate în git)
icons/               # icon-192.png, icon-512.png, apple-touch-icon.png
```

## Stack

- **Leaflet 1.9.4** + **leaflet.markercluster 1.5.3** — harta și clusterele de markere (fără API key)
- **OpenStreetMap** tiles pentru street view, **ArcGIS World Imagery** pentru satelit
- **Flask + SQLite** — API-ul de rapoarte/confirmări/autentificare, servește și fișierele statice
- **Chart.js** (CDN) — graficele din dashboard
- **PWA** — service worker network-first cu cache fallback pentru shell

## Categorii de rapoarte

`Roads & Pavements`, `Fly-tipping & Litter`, `Street Lighting`, `Parks & Green Spaces`, `Public Transport`, `Other` — culorile sunt definite în `CONFIG.CATEGORY_COLORS` din `js/config.js`, iar aceleași valori sunt validate ca CHECK constraint în `server/schema.sql`.

## Backend (Flask + SQLite)

- Toate paginile JS folosesc `fetch()` către rute relative (`/api/...`) — same-origin, fără chei de client.
- Confirmările sunt deduplicate server-side pe IP hash-uit (`server/db.py:hash_voter` + tabelul `confirmations`), nu doar în localStorage (localStorage rămâne doar UX optimist — dezactivează butonul instant).
- Trimiterea de rapoarte e limitată la `MAX_REPORTS_PER_HOUR` per IP hash-uit (tabelul `report_rate_limits`).
- Pozele se salvează pe disc în `uploads/`, servite la `/uploads/<fișier>`.
- Autentificare: cookie de sesiune Flask, parole hash-uite cu `werkzeug.security`. Contul de admin se creează o singură dată cu `flask --app server/app.py create-admin <email> <parolă>`; conturile de cetățean se creează din `profile.html`.
- Nu există push/realtime (websockets) — `app.js`/`dashboard.js` reîmprospătează la interval (`POLL_INTERVAL_MS`, 15s), suficient pentru o aplicație de raportare civică.

## Deploy

Nu e configurat încă — aplicația rulează doar local (`python server/app.py`). SQLite și fișierele din `uploads/` au nevoie de disc persistent, deci un host serverless/static (ex. Netlify) nu e potrivit fără schimbări suplimentare; de discutat separat când vine momentul.

## Service worker — când să crești versiunea

Crește `lcw-vN` din `sw.js` ori de câte ori modifici oricare dintre fișierele din `SHELL`:
`index.html`, `css/styles.css`, `js/config.js`, `js/app.js`, `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png`.

Nu crești versiunea pentru: `dashboard.html`, `admin.html`, `profile.html`, `help.html`, JS-urile lor, sau fișiere care nu sunt în shell-ul PWA.
