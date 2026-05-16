# /data

Build-time data baked into the repo. Production builds read from here. No runtime fetches.

| Folder | Contents | Source |
|--------|----------|--------|
| `pi-urls/` | Original Perfect Imprints category and blog URL lists. | GA4 export, converted by `scripts/url-import/`. |
| `categories/` | One JSON file per AI-generated category page (encoded slug as filename). | DeepSeek pipeline (M2-204). |
| `geiger/` | Scraped Geiger data: `categories.json`, `products.json`, `facet-memberships.json`. | Python scraper at `scripts/scrapers/geiger/`. |
| `mappings/` | `pi-to-geiger.json` mapping each PI root category to a Geiger leaf. | Phase D (M1-110). |
| `blogs/raw/` | Raw blog scrape output prior to Sanity import. | M4-401. |

## Conventions

- Filenames in `categories/` use `__` as a path separator (e.g. `water-bottles__material__stainless-steel.json`).
- Sanity always wins over JSON when both exist for the same slug.
- Files committed here are the source of truth for builds; do not download Geiger images to this folder.
