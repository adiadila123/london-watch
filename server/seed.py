"""Synthetic demo data for London Community Watch.

Regenerate anytime with:
    flask --app server/app.py seed-demo             # wipes + reseeds 60 reports
    flask --app server/app.py seed-demo --count 120  # more/fewer reports
    flask --app server/app.py seed-demo --no-wipe    # add on top of existing reports

Wipes reports/confirmations/report_rate_limits only - never touches users
(admin/citizen accounts survive a reseed).
"""

import random
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
]

DESCRIPTIONS = {
    "Roads & Pavements": [
        "Large pothole in the middle of the road, cars swerving to avoid it",
        "Cracked pavement slab is a trip hazard for pedestrians",
        "Sunken drain cover creating a dip in the carriageway",
        "Road surface breaking up near the junction",
        "Pavement flooded after rain due to blocked drainage",
    ],
    "Fly-tipping & Litter": [
        "Bags of household rubbish dumped on the corner",
        "Old mattress and furniture left on the pavement",
        "Overflowing public bin not collected for days",
        "Construction waste dumped behind the parade of shops",
        "Litter accumulating along the footpath by the fence",
    ],
    "Street Lighting": [
        "Street light has been out for over a week",
        "Flickering lamp post making the street very dark at night",
        "Light fitting hanging loose after recent storm",
        "Whole row of lights out on this street",
        "Broken light near the school crossing, unsafe in winter evenings",
    ],
    "Parks & Green Spaces": [
        "Broken swing left unfixed in the children's playground",
        "Overgrown hedges blocking the path through the park",
        "Damaged bench with sharp broken edges",
        "Fallen tree branch blocking the walking path",
        "Litter and broken glass near the play area",
    ],
    "Public Transport": [
        "Bus shelter glass smashed, waiting area unsafe",
        "Bus stop sign missing, unclear where to wait",
        "Timetable display broken at the station entrance",
        "Damaged pavement at the bus stop makes boarding difficult",
        "No shelter from rain at a very busy stop",
    ],
    "Other": [
        "Graffiti covering the shopfront shutters",
        "Abandoned shopping trolley blocking the footpath",
        "Loose paving stones outside the community centre",
        "Damaged fence panel left unrepaired for weeks",
        "Vandalised signpost, direction no longer readable",
    ],
}

STATUSES = ["reported", "reported", "reported", "in progress", "resolved"]


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
