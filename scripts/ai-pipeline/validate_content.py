"""Content storage schema validation (M2-207).

Walks data/categories/, compares against data/pi-urls/category-urls.json, and
validates every JSON file:

- Every URL in the PI list has a matching JSON file (missing list reported).
- Every JSON file matches the expected schema for its type:
    * root pages: have `buyingGuideHtml`, `buyingGuideH2`, `faqs` (5 items),
      and `promptVersion` == "root-v2"
    * modifier/facet/compound-facet pages: `buyingGuideHtml`/`buyingGuideH2`
      are null, `faqs` is an empty list
- SKU references in `productSkus` resolve to entries in data/geiger/products.json.
- Character length compliance: h1 ≤ 80, metaTitle ≤ 60, metaDescription ≤ 155.

Outputs a markdown report at docs/content-validation-report.md.
Exit code 0 if all checks pass, 1 otherwise.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import orjson

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
OUTPUT_DIR = DATA_DIR / "categories"
URLS_PATH = DATA_DIR / "pi-urls" / "category-urls.json"
PRODUCTS_PATH = DATA_DIR / "geiger" / "products.json"
REPORT_PATH = REPO_ROOT / "docs" / "content-validation-report.md"

logger = logging.getLogger("validate_content")


def _load_json(path: Path) -> Any:
    with path.open("rb") as f:
        return orjson.loads(f.read())


def url_to_filename(url: str) -> str:
    s = url
    if s.startswith("/cat/"):
        s = s[len("/cat/"):]
    return s.replace("/", "__") + ".json"


def filename_to_url(name: str) -> str:
    stem = name[:-5] if name.endswith(".json") else name
    return "/cat/" + stem.replace("__", "/")


def validate_root_doc(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("h1", "metaTitle", "metaDescription", "introHtml",
                "buyingGuideHtml", "buyingGuideH2", "faqs", "heroAltText",
                "productSkus"):
        if key not in doc:
            errors.append(f"missing key: {key}")
    if errors:
        return errors
    if doc.get("promptVersion") != "root-v2":
        errors.append(f"promptVersion is {doc.get('promptVersion')!r}, expected 'root-v2'")
    if not doc["buyingGuideHtml"] or not doc["buyingGuideHtml"].strip():
        errors.append("buyingGuideHtml empty")
    if not doc["buyingGuideH2"] or not doc["buyingGuideH2"].strip():
        errors.append("buyingGuideH2 empty")
    if not isinstance(doc["faqs"], list) or len(doc["faqs"]) != 5:
        errors.append(f"faqs count {len(doc.get('faqs', []))} != 5")
    return errors


def validate_nonroot_doc(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("h1", "metaTitle", "metaDescription", "introHtml",
                "heroAltText", "productSkus"):
        if key not in doc:
            errors.append(f"missing key: {key}")
    if errors:
        return errors
    if doc.get("buyingGuideHtml") not in (None, ""):
        errors.append("non-root has buyingGuideHtml set")
    if doc.get("buyingGuideH2") not in (None, ""):
        errors.append("non-root has buyingGuideH2 set")
    if doc.get("faqs") not in (None, [], ()):
        errors.append(f"non-root has non-empty faqs ({len(doc['faqs'])} items)")
    return errors


def validate_length_caps(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    h1 = doc.get("h1") or ""
    mt = doc.get("metaTitle") or ""
    md = doc.get("metaDescription") or ""
    if len(h1) > 80:
        errors.append(f"h1 length {len(h1)} > 80")
    if len(mt) > 60:
        errors.append(f"metaTitle length {len(mt)} > 60")
    if len(md) > 155:
        errors.append(f"metaDescription length {len(md)} > 155")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", default=str(REPORT_PATH),
                        help=f"Output report path (default {REPORT_PATH}).")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress per-file warning output.")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if not OUTPUT_DIR.exists():
        logger.error("Output dir %s does not exist", OUTPUT_DIR)
        return 1

    logger.info("Loading URL list and products...")
    urls_doc = _load_json(URLS_PATH)
    urls = urls_doc["urls"]
    products = _load_json(PRODUCTS_PATH)["products"]
    valid_skus = {p["sku"] for p in products if p.get("sku")}
    logger.info("Loaded %d URLs and %d products", len(urls), len(products))

    urls_by_key = {u["url"]: u for u in urls}

    # Walk the category dir.
    files = sorted(p for p in OUTPUT_DIR.glob("*.json") if not p.name.startswith("."))
    logger.info("Found %d JSON files in %s", len(files), OUTPUT_DIR)

    # Detect missing and extra files.
    expected_urls = set(urls_by_key.keys())
    found_urls = {filename_to_url(p.name) for p in files}
    missing_urls = sorted(expected_urls - found_urls)
    extra_files = sorted(found_urls - expected_urls)

    # Per-file validation.
    schema_errors: dict[str, list[str]] = {}
    length_violations: dict[str, list[str]] = {}
    orphan_skus: dict[str, list[str]] = {}
    type_counts: Counter[str] = Counter()
    prompt_version_counts: Counter[str] = Counter()
    sku_filter_mode_counts: Counter[str] = Counter()

    for path in files:
        try:
            doc = _load_json(path)
        except Exception as exc:  # noqa: BLE001
            schema_errors[path.name] = [f"unparseable JSON: {exc}"]
            continue

        page_type = doc.get("type", "unknown")
        type_counts[page_type] += 1
        if doc.get("promptVersion"):
            prompt_version_counts[doc["promptVersion"]] += 1
        if doc.get("skuFilterMode"):
            sku_filter_mode_counts[doc["skuFilterMode"]] += 1

        if page_type == "root":
            errs = validate_root_doc(doc)
        elif page_type in ("modifier", "facet", "compound-facet"):
            errs = validate_nonroot_doc(doc)
        else:
            errs = [f"unknown type: {page_type}"]
        if errs:
            schema_errors[path.name] = errs

        cap_errs = validate_length_caps(doc)
        if cap_errs:
            length_violations[path.name] = cap_errs

        # Check that the file's URL actually exists in the URL list.
        url_from_file = filename_to_url(path.name)
        if url_from_file not in urls_by_key and doc.get("url") not in urls_by_key:
            schema_errors.setdefault(path.name, []).append(
                f"file URL {url_from_file!r} not in pi-urls list"
            )

        # Orphan SKU references.
        skus = doc.get("productSkus") or []
        bad = [s for s in skus if s not in valid_skus]
        if bad:
            orphan_skus[path.name] = bad[:10]  # cap output

    # Report.
    report = build_report(
        urls=urls,
        urls_doc=urls_doc,
        files=files,
        missing_urls=missing_urls,
        extra_files=extra_files,
        schema_errors=schema_errors,
        length_violations=length_violations,
        orphan_skus=orphan_skus,
        type_counts=type_counts,
        prompt_version_counts=prompt_version_counts,
        sku_filter_mode_counts=sku_filter_mode_counts,
    )
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")
    logger.info("Wrote report to %s", report_path)

    total_errors = (
        len(missing_urls)
        + len(extra_files)
        + len(schema_errors)
        + len(length_violations)
        + len(orphan_skus)
    )
    print(f"\nSummary: missing={len(missing_urls)} extra={len(extra_files)} "
          f"schema_errors={len(schema_errors)} length_violations={len(length_violations)} "
          f"orphan_sku_files={len(orphan_skus)}")
    return 0 if total_errors == 0 else 1


def build_report(*, urls, urls_doc, files, missing_urls, extra_files,
                 schema_errors, length_violations, orphan_skus,
                 type_counts, prompt_version_counts, sku_filter_mode_counts) -> str:
    lines: list[str] = []
    now = datetime.now(timezone.utc).isoformat()
    lines.append("# Content Validation Report")
    lines.append("")
    lines.append(f"Generated: {now}")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- PI URLs in catalog: **{len(urls):,}**")
    lines.append(f"- JSON files on disk: **{len(files):,}**")
    lines.append(f"- Missing files (URL with no JSON): **{len(missing_urls):,}**")
    lines.append(f"- Extra files (JSON without matching URL): **{len(extra_files):,}**")
    lines.append("")
    lines.append("## Type breakdown")
    lines.append("")
    lines.append("| type | files | expected |")
    lines.append("|---|---:|---:|")
    expected_by_type = {
        "root": urls_doc.get("rootCount"),
        "modifier": urls_doc.get("modifierCount"),
        "facet": urls_doc.get("facetCount"),
        "compound-facet": urls_doc.get("compoundFacetCount"),
    }
    for t in ("root", "modifier", "facet", "compound-facet"):
        lines.append(f"| {t} | {type_counts.get(t, 0):,} | "
                     f"{expected_by_type.get(t) or 'n/a'} |")
    other = sum(c for t, c in type_counts.items()
                if t not in ("root", "modifier", "facet", "compound-facet"))
    if other:
        lines.append(f"| other/unknown | {other:,} | 0 |")
    lines.append("")
    lines.append("## promptVersion distribution")
    lines.append("")
    for v, c in sorted(prompt_version_counts.items()):
        lines.append(f"- `{v}`: {c:,}")
    lines.append("")
    lines.append("## skuFilterMode distribution")
    lines.append("")
    for m, c in sorted(sku_filter_mode_counts.items()):
        lines.append(f"- `{m}`: {c:,}")
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    lines.append(f"- Schema errors: **{len(schema_errors):,}** files")
    lines.append(f"- Length-cap violations (h1>80, metaTitle>60, metaDescription>155): "
                 f"**{len(length_violations):,}** files")
    lines.append(f"- Files with orphan SKU references: **{len(orphan_skus):,}**")
    lines.append("")

    if missing_urls:
        lines.append(f"### Missing files ({len(missing_urls)})")
        lines.append("")
        for u in missing_urls[:50]:
            lines.append(f"- `{u}`")
        if len(missing_urls) > 50:
            lines.append(f"- _(+{len(missing_urls) - 50} more)_")
        lines.append("")

    if extra_files:
        lines.append(f"### Extra files ({len(extra_files)})")
        lines.append("")
        for u in extra_files[:50]:
            lines.append(f"- `{u}`")
        if len(extra_files) > 50:
            lines.append(f"- _(+{len(extra_files) - 50} more)_")
        lines.append("")

    if schema_errors:
        lines.append(f"### Schema errors ({len(schema_errors)})")
        lines.append("")
        for name, errs in list(schema_errors.items())[:50]:
            lines.append(f"- `{name}`")
            for e in errs:
                lines.append(f"    - {e}")
        if len(schema_errors) > 50:
            lines.append(f"- _(+{len(schema_errors) - 50} more)_")
        lines.append("")

    if length_violations:
        lines.append(f"### Length-cap violations ({len(length_violations)})")
        lines.append("")
        for name, errs in list(length_violations.items())[:50]:
            lines.append(f"- `{name}`: {'; '.join(errs)}")
        if len(length_violations) > 50:
            lines.append(f"- _(+{len(length_violations) - 50} more)_")
        lines.append("")

    if orphan_skus:
        lines.append(f"### Files with orphan SKU references ({len(orphan_skus)})")
        lines.append("")
        for name, bad in list(orphan_skus.items())[:30]:
            lines.append(f"- `{name}`: {len(bad)} bad sample={bad[:5]}")
        if len(orphan_skus) > 30:
            lines.append(f"- _(+{len(orphan_skus) - 30} more)_")
        lines.append("")

    if not (missing_urls or extra_files or schema_errors or length_violations or orphan_skus):
        lines.append("All checks passed.")
        lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
