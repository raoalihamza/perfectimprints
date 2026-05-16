# Geiger Scraper

Scrapes Geiger taxonomy (Phase A) and product catalog (Phase B) for the Perfect Imprints rebuild. Phases C and D are stubs for Week 2 (see `TASKS.md` M1-109 and M1-110).

All output lands in `data/geiger/` at the project root.

## Setup (one-time)

From the project root:

```
cd scripts/scrapers/geiger
python -m venv .venv
source .venv/bin/activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -e .
```

If you use `uv` instead:

```
cd scripts/scrapers/geiger
uv venv
uv pip install -e .
```

## Run the pipeline

All commands are run from the **project root** (not the scraper directory).

### Phase A only (taxonomy, ~30 seconds)

```
python -m scripts.scrapers.geiger.run --phase a
```

Output: `data/geiger/categories.json`.

### Phase B test run (first 5 leaves, ~3 minutes)

```
python -m scripts.scrapers.geiger.run --phase b --limit-categories 5
```

### Phase B full run (~20-40 minutes)

```
python -m scripts.scrapers.geiger.run --phase b
```

Output: `data/geiger/products.json`.

### Resuming Phase B after interruption

```
python -m scripts.scrapers.geiger.run --phase b --resume
```

The checkpoint is saved every 5 categories. If a run is killed mid-way, restart with `--resume` to skip already-completed leaves.

### Run A then B

```
python -m scripts.scrapers.geiger.run --phase all
```

(Phases C and D will skip with a notice until they are implemented in Week 2.)

## Expected output sizes

- `categories.json`: 50 KB to 200 KB (350 to 500 categories)
- `products.json`: 30 MB to 80 MB (20k to 40k products)

## Troubleshooting

- **HTTP 429 or 503:** Increase `THROTTLE_SECONDS` in `config.py`. Defaults to 1.0.
- **"Mega menu not found" in Phase A:** Geiger's HTML changed. Inspect the live page and update `_find_mega_menu()` in `discover.py`.
- **Phase B stalls:** Kill it (Ctrl+C). Resume with `--resume`. Checkpoint state is at `scripts/scrapers/geiger/.checkpoint/phase-b.json`.
- **Corrupted checkpoint:** Delete `scripts/scrapers/geiger/.checkpoint/phase-b.json` and rerun without `--resume`.

## Phase C and D

Scheduled for Week 2. Calling `--phase c` or `--phase d` currently raises `NotImplementedError` pointing to the relevant `TASKS.md` ticket.
