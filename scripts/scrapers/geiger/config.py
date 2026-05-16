"""Configuration constants for the Geiger scraper."""

from pathlib import Path

# Searchspring (Geiger's product search backend)
SEARCHSPRING_SITE_ID = "kfx28d"
SEARCHSPRING_BASE_URL = "https://kfx28d.a.searchspring.io/api/search/category.json"

# Geiger taxonomy entry point (any category page works for mega menu)
GEIGER_BASE_URL = "https://www.geiger.com"
GEIGER_DISCOVERY_URL = "https://www.geiger.com/b/accessories"

# Project paths (this module lives at scripts/scrapers/geiger/)
PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = PROJECT_ROOT / "data" / "geiger"
CHECKPOINT_DIR = Path(__file__).resolve().parent / ".checkpoint"

# Throttle and retry
THROTTLE_SECONDS = 1.0
MAX_RETRIES = 5
RETRY_BACKOFF_MULTIPLIER = 2.0

# HTTP
# Geiger sits behind a bot-protection layer that 403s non-browser User-Agents.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT_SECONDS = 30

# Ensure output and checkpoint directories exist on first use.
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
