import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if (BASE_DIR / "server").is_dir():
    SERVER_DIR = BASE_DIR / "server"
else:
    SERVER_DIR = BASE_DIR

if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

port_raw = os.environ.get("PORT", "8080")
try:
    port = int(port_raw)
except (ValueError, TypeError):
    port = 8080

print(f"[STARTUP] Launching London Community Watch on port {port}...")

# Run Gunicorn with the parsed integer port
os.execvp(
    "gunicorn",
    [
        "gunicorn",
        "--chdir",
        str(SERVER_DIR),
        "--workers",
        "1",
        "--threads",
        "4",
        "app:app",
        "--bind",
        f"0.0.0.0:{port}",
    ],
)
