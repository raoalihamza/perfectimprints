# Launch runbook

STUB for M6-603. Will be expanded during pre-launch.

Outline:

1. T-48 hours: lower DNS TTL on perfectimprints.com to 300s
2. T-24 hours: final scrape and AI regeneration on a fresh branch
3. T-12 hours: production build verification, env var sanity check
4. T-6 hours: SPF/DKIM verification for Gmail SMTP
5. Launch: repoint apex to Cloudflare Pages production
6. T+0 to T+24: monitor GSC, GA4, Cloudflare logs, lead form submissions
7. T+24: submit updated sitemap to Google Search Console

Rollback plan if HTTPS, certs, or DNS misbehave.
