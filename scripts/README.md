# Scripts

Top-level scripts and pipelines for the Perfect Imprints rebuild.

| Folder | Purpose | Status |
|--------|---------|--------|
| `scrapers/geiger/` | Phase A (taxonomy) + Phase B (products) | Implemented |
| `scrapers/geiger/memberships.py` | Phase C (facet memberships) | Stub - M1-109 |
| `scrapers/geiger/mapping.py` | Phase D (PI <-> Geiger mapping) | Stub - M1-110 |
| `scrapers/blogs/` | Playwright blog scraper | Stub - M4-401 |
| `ai-pipeline/` | DeepSeek-V3 content generation | Stub - M2-201..M2-207 |
| `search-index/` | Fuse.js index builder | Stub - M5-502 |
| `seed-content/` | Sanity singleton seeding | Stub |
| `url-import/` | Excel -> JSON URL list converter | Implemented |

See `TASKS.md` for ticket scope. Run scripts from the **project root**, not from `scripts/`.
