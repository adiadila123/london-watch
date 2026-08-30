import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

port_raw = os.environ.get("PORT", "8080")
try:
    port = int(port_raw)
except (ValueError, TypeError):
    port = 8080

print(f"[STARTUP] Launching London Community Watch on port {port}...")

os.execvp(
    "gunicorn",
    [
        "gunicorn",
        "--chdir",
        str(BASE_DIR),
        "--workers",
        "1",
        "--threads",
        "4",
        "app:app",
        "--bind",
        f"0.0.0.0:{port}",
    ],
)
