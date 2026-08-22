"""London Community Watch - Flask + SQLite backend.

Serves the existing static frontend (unchanged HTML/CSS/JS files at the
repo root) plus a small JSON API that replaces everything Supabase used
to do: reports CRUD, IP-hashed confirmation dedup, IP-hashed submission
rate-limiting, citizen accounts, and the admin account.

Run locally with:
    pip install -r server/requirements.txt
    flask --app server/app.py create-admin you@example.com yourpassword
    python server/app.py
"""

import os
from functools import wraps
from pathlib import Path

import click
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

import db
import seed as seed_module

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent

load_dotenv(BASE_DIR / ".env")

# Same DATA_DIR as db.py, so uploads/ and lcw.db live on the same
# persistent volume in production; defaults to the repo root for local dev.
UPLOAD_DIR = Path(os.environ.get("DATA_DIR", REPO_ROOT)) / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# static_folder=None disables Flask's default "serve anything under this
# folder" behaviour - server/ (with .env, lcw.db, schema.sql) sits right
# next to the frontend files, so we whitelist exactly what's public below
# instead of exposing the whole repo root.
app = Flask(__name__, static_folder=None)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
app.config["VOTER_HASH_SALT"] = os.environ.get("VOTER_HASH_SALT", "dev-salt-change-me")
app.config["MAX_REPORTS_PER_HOUR"] = int(os.environ.get("MAX_REPORTS_PER_HOUR", 8))
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # 6 MB request cap (photos are ~5 MB max)

if app.config["SECRET_KEY"] == "dev-secret-change-me":
    print("WARNING: using the default SECRET_KEY - copy server/.env.example to server/.env "
          "and set a real one before anything but local testing.")

# Runs on import (not just under `python server/app.py`) so the schema
# also gets created when gunicorn imports this module in production.
db.init_db()

CATEGORIES = {
    "Roads & Pavements",
    "Fly-tipping & Litter",
    "Street Lighting",
    "Parks & Green Spaces",
    "Public Transport",
    "Other",
}
STATUSES = {"reported", "in progress", "resolved"}
LONDON_BOUNDS = {"lat_min": 51.28, "lat_max": 51.70, "lng_min": -0.52, "lng_max": 0.34}
ALLOWED_PHOTO_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return jsonify(error="Unauthorized"), 401
        return fn(*args, **kwargs)
    return wrapper


# ---------- STATIC FRONTEND (explicit whitelist - see static_folder note above) ----------

PUBLIC_PAGES = {
    "index.html", "admin.html", "dashboard.html", "profile.html", "help.html",
    "manifest.webmanifest", "robots.txt", "sitemap.xml", "sw.js",
}


@app.get("/")
def root():
    return send_from_directory(REPO_ROOT, "index.html")


@app.get("/<page>")
def page(page):
    if page not in PUBLIC_PAGES:
        abort(404)
    return send_from_directory(REPO_ROOT, page)


@app.get("/css/<path:filename>")
def css(filename):
    return send_from_directory(REPO_ROOT / "css", filename)


@app.get("/js/<path:filename>")
def js_files(filename):
    return send_from_directory(REPO_ROOT / "js", filename)


@app.get("/icons/<path:filename>")
def icons(filename):
    return send_from_directory(REPO_ROOT / "icons", filename)


@app.get("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ---------- REPORTS API ----------

@app.get("/api/reports")
def list_reports():
    conn = db.get_db()
    bbox = request.args.get("bbox")
    ids = request.args.get("ids")

    where, params = [], []
    if bbox:
        try:
            south, west, north, east = (float(x) for x in bbox.split(","))
        except ValueError:
            conn.close()
            return jsonify(error="Invalid bbox"), 400
        where.append("lat >= ? and lat <= ? and lng >= ? and lng <= ?")
        params += [south, north, west, east]
    if ids:
        id_list = [i for i in ids.split(",") if i]
        if id_list:
            where.append(f"id in ({','.join('?' for _ in id_list)})")
            params += id_list

    query = "select * from reports"
    if where:
        query += " where " + " and ".join(where)
    query += " order by created_at desc"
    if bbox:
        # Viewport loads cap out like the old .limit(1000) did; admin/
        # dashboard's unfiltered "give me everything" call does not.
        query += " limit 1000"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/api/reports/<report_id>")
def get_report(report_id):
    conn = db.get_db()
    row = conn.execute("select * from reports where id = ?", (report_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify(error="Not found"), 404
    return jsonify(dict(row))


@app.post("/api/reports")
def create_report():
    category = request.form.get("category", "")
    description = request.form.get("description", "")

    if category not in CATEGORIES:
        return jsonify(error="Invalid category"), 400
    if not (3 <= len(description) <= 500):
        return jsonify(error="Description must be 3-500 characters"), 400
    try:
        lat = float(request.form.get("lat"))
        lng = float(request.form.get("lng"))
    except (TypeError, ValueError):
        return jsonify(error="Invalid location"), 400
    if not (LONDON_BOUNDS["lat_min"] <= lat <= LONDON_BOUNDS["lat_max"]
            and LONDON_BOUNDS["lng_min"] <= lng <= LONDON_BOUNDS["lng_max"]):
        return jsonify(error="Location must be within Greater London"), 400

    voter_hash = db.hash_voter(request.remote_addr, app.config["VOTER_HASH_SALT"])
    conn = db.get_db()
    try:
        if not db.check_rate_limit(conn, voter_hash, app.config["MAX_REPORTS_PER_HOUR"]):
            conn.commit()  # keep the rate-limit accounting even though this submission is rejected
            max_per_hour = app.config["MAX_REPORTS_PER_HOUR"]
            return jsonify(
                error=f"Too many reports from this connection - limit is {max_per_hour} per "
                      "hour. Please try again later."
            ), 429

        photo_url = None
        photo = request.files.get("photo")
        if photo and photo.filename:
            ext = ALLOWED_PHOTO_TYPES.get(photo.mimetype)
            if not ext:
                conn.rollback()
                return jsonify(error="Unsupported photo type"), 400
            filename = f"{db.new_id()}.{ext}"
            photo.save(UPLOAD_DIR / filename)
            photo_url = f"/uploads/{filename}"

        report_id = db.new_id()
        conn.execute(
            "insert into reports (id, category, description, photo_url, lat, lng, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?)",
            (report_id, category, description, photo_url, lat, lng, db.now_iso())
        )
        conn.commit()
        row = conn.execute("select * from reports where id = ?", (report_id,)).fetchone()
        return jsonify(dict(row)), 201
    finally:
        conn.close()


@app.post("/api/reports/<report_id>/confirm")
def confirm_report(report_id):
    voter_hash = db.hash_voter(request.remote_addr, app.config["VOTER_HASH_SALT"])
    conn = db.get_db()
    try:
        new_total = db.confirm_report(conn, report_id, voter_hash)
        if new_total is None:
            conn.rollback()
            return jsonify(error="Not found"), 404
        conn.commit()
        return jsonify(confirmations=new_total)
    finally:
        conn.close()


@app.patch("/api/reports/<report_id>")
@admin_required
def update_report_status(report_id):
    body = request.get_json(silent=True) or {}
    status = body.get("status")
    if status not in STATUSES:
        return jsonify(error="Invalid status"), 400
    conn = db.get_db()
    cur = conn.execute("update reports set status = ? where id = ?", (status, report_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify(error="Not found"), 404
    return jsonify(status=status)


@app.delete("/api/reports/<report_id>")
@admin_required
def delete_report(report_id):
    conn = db.get_db()
    row = conn.execute("select photo_url from reports where id = ?", (report_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="Not found"), 404
    conn.execute("delete from reports where id = ?", (report_id,))
    conn.commit()
    conn.close()
    if row["photo_url"]:
        (UPLOAD_DIR / row["photo_url"].rsplit("/", 1)[-1]).unlink(missing_ok=True)
    return jsonify(ok=True)


# ---------- CITIZEN AUTH (profile.html) ----------

@app.post("/api/auth/signup")
def signup():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    nickname = (body.get("nickname") or "").strip() or None

    if not email or not password:
        return jsonify(error="Email and password are required"), 400

    conn = db.get_db()
    if conn.execute("select id from users where email = ?", (email,)).fetchone():
        conn.close()
        return jsonify(error="An account with this email already exists"), 409

    user_id = db.new_id()
    conn.execute(
        "insert into users (id, email, password_hash, nickname, created_at) values (?, ?, ?, ?, ?)",
        (user_id, email, generate_password_hash(password), nickname, db.now_iso())
    )
    conn.commit()
    conn.close()
    session["citizen_id"] = user_id
    return jsonify(email=email, nickname=nickname), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    conn = db.get_db()
    row = conn.execute("select * from users where email = ?", (email,)).fetchone()
    conn.close()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify(error="Invalid email or password"), 401

    session["citizen_id"] = row["id"]
    return jsonify(email=row["email"], nickname=row["nickname"])


@app.post("/api/auth/logout")
def logout():
    session.pop("citizen_id", None)
    return jsonify(ok=True)


@app.get("/api/auth/me")
def me():
    if not session.get("citizen_id"):
        return jsonify(user=None)
    conn = db.get_db()
    row = conn.execute(
        "select email, nickname from users where id = ?", (session["citizen_id"],)
    ).fetchone()
    conn.close()
    return jsonify(user=dict(row) if row else None)


# ---------- ADMIN AUTH (admin.html) ----------

@app.post("/api/admin/login")
def admin_login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    conn = db.get_db()
    row = conn.execute(
        "select * from users where email = ? and is_admin = 1", (email,)
    ).fetchone()
    conn.close()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify(error="Invalid email or password"), 401

    session["admin_id"] = row["id"]
    return jsonify(email=row["email"])


@app.post("/api/admin/logout")
def admin_logout():
    session.pop("admin_id", None)
    return jsonify(ok=True)


@app.get("/api/admin/me")
def admin_me():
    if not session.get("admin_id"):
        return jsonify(user=None)
    conn = db.get_db()
    row = conn.execute("select email from users where id = ?", (session["admin_id"],)).fetchone()
    conn.close()
    return jsonify(user=dict(row) if row else None)


# ---------- CLI ----------

@app.cli.command("create-admin")
@click.argument("email")
@click.argument("password")
def create_admin_command(email, password):
    """Bootstrap the one admin account: flask --app server/app.py create-admin you@x.com pw"""
    db.init_db()
    db.create_admin_user(email.strip().lower(), password)
    click.echo(f"Admin account created: {email}")


@app.cli.command("seed-demo")
@click.option("--count", default=60, show_default=True, help="Number of synthetic reports to create.")
@click.option("--wipe/--no-wipe", default=True, show_default=True,
              help="Delete existing reports/confirmations before seeding.")
def seed_demo_command(count, wipe):
    """Populate the map with synthetic reports for demo purposes.

    Never touches the users table - admin/citizen accounts survive a reseed.
    """
    db.init_db()
    if wipe:
        seed_module.wipe()
    seed_module.seed(count)
    click.echo(f"Seeded {count} synthetic reports" + (" (existing reports wiped)" if wipe else ""))


if __name__ == "__main__":
    # 5000 collides with macOS AirPlay Receiver on many Macs, so this
    # uses 5050 instead.
    app.run(debug=True, port=int(os.environ.get("PORT", 5050)))
