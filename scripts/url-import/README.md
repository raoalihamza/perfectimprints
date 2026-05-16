# URL Import

One-shot converter from the GA4 Excel exports to JSON URL indexes consumed by the Next.js loader at `lib/pi-urls.ts`.

## Files in this folder

| File | Purpose |
|------|---------|
| `Category_Pages.xlsx` | GA4 export of category URLs (~22,213 raw rows). |
| `Blog_Links.xlsx`     | GA4 export of blog URLs (~823 raw rows). |
| `import-urls.ts`      | Conversion script.

## Run

From the project root:

```
pnpm import-urls
```

## Output

| Path | Shape |
|------|-------|
| `data/pi-urls/category-urls.json` | `{ totalCount, rootCount, facetCount, urls: CategoryUrlEntry[] }` |
| `data/pi-urls/blog-urls.json`     | `{ totalCount, urls: BlogUrlEntry[] }` |

Expected counts after filtering:

- Categories total: 22,181 (491 roots + 21,690 facets)
- Blogs total: 731 (depth-1 article URLs)

If counts drift by more than 50 (categories) or 25 (blogs), the script logs a warning. Adjust the filter rules in `import-urls.ts` and rerun.
