# London Community Watch — run locally

## 1. Backend (Flask + SQLite)
```
pip install -r server/requirements.txt
cp server/.env.example server/.env
```
Open `server/.env` and set `SECRET_KEY` and `VOTER_HASH_SALT` to two different long random
strings (used to sign the session cookie and to hash visitor IPs for confirmation/rate-limit
dedup — never store the raw IP).

Create the one admin account (used to log into `admin.html`):
```
flask --app server/app.py create-admin you@example.com your-password
```

## 2. Run
```
python server/app.py
```
Open `http://localhost:5050` — Flask serves both the frontend and the `/api/...` endpoints,
so there's nothing else to start and no build step.

## 3. Data
- `server/lcw.db` (SQLite file) and `uploads/` (report photos) are created automatically on
  first run and are gitignored — they're local data, not part of the source tree.
- Citizen accounts are created from `profile.html` directly (sign up); the admin account is
  the one created above via `flask create-admin`.

Deploying this somewhere isn't set up yet — SQLite and `uploads/` need a persistent disk,
so a static/serverless host won't work as-is. That's a separate step for later.
