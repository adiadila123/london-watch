"""Synthetic demo data & live activity simulator for London Community Watch.

Regenerate manually anytime with:
    flask --app server/app.py seed-demo             # wipes + reseeds 60 reports
    flask --app server/app.py seed-demo --count 120  # more/fewer reports
    flask --app server/app.py seed-demo --no-wipe    # add on top of existing reports

Wipes reports/confirmations/report_rate_limits only - never touches users
(admin/citizen accounts survive a reseed).
"""

import os
import random
import threading
import time
from datetime import datetime, timedelta, timezone

import db

# Real London hubs to jitter around, so points cluster like genuine reports
# instead of scattering uniformly across the whole bounding box.
HUBS = [
    (51.5074, -0.1278),  # Central / Westminster
    (51.5155, -0.0922),  # City of London
    (51.5416, -0.0553),  # Hackney
    (51.4613, -0.1156),  # Brixton
    (51.4700, -0.4543),  # Heathrow / Hounslow
    (51.6100, -0.2000),  # Enfield / Barnet
    (51.4085, -0.3010),  # Kingston
    (51.5450, 0.0553),   # Newham / Stratford
    (51.3900, 0.0700),   # Bromley / Croydon border
    (51.5900, -0.1100),  # Haringey / Islington
    (51.4816, -0.0090),  # Greenwich
    (51.4875, -0.1687),  # Chelsea / Battersea
    (51.5560, -0.1780),  # Hampstead / Camden
]

DESCRIPTIONS = {
    "Roads & Pavements": [
        "Large pothole in the middle of the road, cars swerving to avoid it",
        "Cracked pavement slab is a trip hazard for pedestrians",
        "Sunken drain cover creating a dip in the carriageway",
        "Road surface breaking up near the junction",
        "Pavement flooded after rain due to blocked drainage",
        "Missing bollard on the pedestrian corner causing dangerous parking",
        "Deep rut in asphalt near the bus stop curb",
        "Uneven paving stones outside the local market",
    ],
    "Fly-tipping & Litter": [
        "Bags of household rubbish dumped on the corner",
        "Old mattress and furniture left on the pavement",
        "Overflowing public bin not collected for days",
        "Construction waste dumped behind the parade of shops",
        "Litter accumulating along the footpath by the fence",
        "Discarded electronic appliances blocking the alleyway",
        "Piles of cardboard boxes left beside the recycling bank",
        "Fly-tipped tyres and paint cans near the railway arches",
    ],
    "Street Lighting": [
        "Street light has been out for over a week",
        "Flickering lamp post making the street very dark at night",
        "Light fitting hanging loose after recent storm",
        "Whole row of lights out on this street",
        "Broken light near the school crossing, unsafe in winter evenings",
        "Dim orange light completely obscured by tree canopy",
        "Damaged inspection cover on the lamp post base with exposed wires",
    ],
    "Parks & Green Spaces": [
        "Broken swing left unfixed in the children's playground",
        "Overgrown hedges blocking the path through the park",
        "Damaged bench with sharp broken edges",
        "Fallen tree branch blocking the walking path",
        "Litter and broken glass near the play area",
        "Flooded grass area near the community sports pitch",
        "Damaged boundary fence along the nature reserve path",
        "Graffiti sprayed on the park pavilion and public benches",
    ],
    "Public Transport": [
        "Bus shelter glass smashed, waiting area unsafe",
        "Bus stop sign missing, unclear where to wait",
        "Timetable display broken at the station entrance",
        "Damaged pavement at the bus stop makes boarding difficult",
        "No shelter from rain at a very busy stop",
        "Broken electronic arrival board showing error screen",
        "Litter bin at the bus stop completely overflowing",
    ],
    "Other": [
        "Graffiti covering the shopfront shutters",
        "Abandoned shopping trolley blocking the footpath",
        "Loose paving stones outside the community centre",
        "Damaged fence panel left unrepaired for weeks",
        "Vandalised signpost, direction no longer readable",
        "Commercial sign fallen onto the sidewalk",
        "Abandoned bicycle stripped of parts locked to railing",
    ],
}

STATUSES = ["reported", "reported", "reported", "in progress", "resolved"]

_simulator_thread = None
_simulator_lock = threading.Lock()
_simulator_running = False


def _random_point():
    lat0, lng0 = random.choice(HUBS)
    lat = lat0 + random.uniform(-0.03, 0.03)
    lng = lng0 + random.uniform(-0.03, 0.03)
    lat = min(max(lat, 51.28), 51.70)
    lng = min(max(lng, -0.52), 0.34)
    return lat, lng


def _random_timestamp():
    days_ago = random.uniform(0, 30)
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def wipe():
    with db.get_db() as conn:
        conn.execute("delete from confirmations")
        conn.execute("delete from report_rate_limits")
        conn.execute("delete from reports")


def seed(count=60):
    with db.get_db() as conn:
        for _ in range(count):
            category = random.choice(list(DESCRIPTIONS))
            lat, lng = _random_point()
            report_id = db.new_id()
            created_at = _random_timestamp()
            confirmations = random.choices(
                [0, 1, 2, 3, 5, 8, 13], weights=[30, 25, 20, 12, 8, 4, 1]
            )[0]
            conn.execute(
                "insert into reports "
                "(id, category, description, photo_url, lat, lng, confirmations, status, created_at) "
                "values (?, ?, ?, null, ?, ?, ?, ?, ?)",
                (
                    report_id,
                    category,
                    random.choice(DESCRIPTIONS[category]),
                    lat,
                    lng,
                    confirmations,
                    random.choice(STATUSES),
                    created_at,
                ),
            )
        conn.commit()


def ensure_seeded(count=60):
    """Populates initial synthetic reports if the database is empty."""
    with db.get_db() as conn:
        row = conn.execute("select count(*) as c from reports").fetchone()
        if row and row["c"] == 0:
            print(f"[AUTO-SEED] Database has no reports. Seeding {count} synthetic reports...")
            seed(count)
            print(f"[AUTO-SEED] Successfully seeded {count} reports across London.")
        else:
            print(f"[AUTO-SEED] Database already contains {row['c']} reports.")


def simulate_step():
    """Simulates one piece of civic activity:
    - 55% chance: citizen submits a new report (now)
    - 30% chance: citizen confirms an existing active issue
    - 15% chance: council progresses an issue status (reported -> in progress -> resolved)
    """
    roll = random.random()
    with db.get_db() as conn:
        if roll < 0.55:
            category = random.choice(list(DESCRIPTIONS))
            lat, lng = _random_point()
            report_id = db.new_id()
            created_at = db.now_iso()
            desc = random.choice(DESCRIPTIONS[category])
            conn.execute(
                "insert into reports "
                "(id, category, description, photo_url, lat, lng, confirmations, status, created_at) "
                "values (?, ?, ?, null, ?, ?, 0, 'reported', ?)",
                (report_id, category, desc, lat, lng, created_at),
            )
            conn.commit()
            return f"New report submitted [{category}] '{desc[:45]}...' near ({lat:.4f}, {lng:.4f})"

        elif roll < 0.85:
            row = conn.execute(
                "select id, category, description from reports where status in ('reported', 'in progress') order by random() limit 1"
            ).fetchone()
            if row:
                voter_hash = db.hash_voter(f"sim-citizen-{random.randint(1000, 999999)}", "live-sim-salt")
                new_count = db.confirm_report(conn, row["id"], voter_hash)
                conn.commit()
                return f"Confirmed report [{row['category']}] #{row['id'][:8]} (total confirmations: {new_count})"
            return None

        else:
            row = conn.execute(
                "select id, category, status from reports where status != 'resolved' order by random() limit 1"
            ).fetchone()
            if row:
                old_status = row["status"]
                new_status = "in progress" if old_status == "reported" else "resolved"
                conn.execute("update reports set status = ? where id = ?", (new_status, row["id"]))
                conn.commit()
                return f"Status updated for [{row['category']}] #{row['id'][:8]}: '{old_status}' -> '{new_status}'"
            return None


def _simulator_loop(interval_sec):
    global _simulator_running
    while _simulator_running:
        try:
            time.sleep(interval_sec)
            if not _simulator_running:
                break
            action = simulate_step()
            if action:
                print(f"[LIVE SIMULATOR] {action}")
        except Exception as e:
            print(f"[LIVE SIMULATOR ERROR] {e}")


def start_live_simulator(interval_sec=20):
    """Starts the background simulator daemon thread if not already running."""
    global _simulator_thread, _simulator_running
    with _simulator_lock:
        if _simulator_running and _simulator_thread and _simulator_thread.is_alive():
            return

        # Avoid double-spawning when Flask's Werkzeug reloader is in parent process
        if os.environ.get("WERKZEUG_RUN_MAIN") == "false":
            return

        _simulator_running = True
        thread = threading.Thread(
            target=_simulator_loop,
            args=(interval_sec,),
            daemon=True,
            name="LondonWatchSimulator",
        )
        thread.start()
        _simulator_thread = thread
        print(f"[LIVE SIMULATOR] Started background activity simulator (every {interval_sec}s)")


def stop_live_simulator():
    """Stops the background simulator."""
    global _simulator_running
    _simulator_running = False
