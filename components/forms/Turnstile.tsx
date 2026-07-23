'use client';

import Script from 'next/script';

/**
 * Cloudflare Turnstile widget (managed/invisible mode — "auto-detect" CAPTCHA).
 *
 * Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the lead form
 * keeps working on environments where Turnstile has not been configured yet
 * (e.g. staging before the keys are added). Once the key is present the widget
 * loads and Cloudflare injects a hidden `cf-turnstile-response` input into the
 * surrounding <form>; the server verifies that token against siteverify.
 *
 * The public key is inlined at build time, so reading it here does not make any
 * consuming page dynamic.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function Turnstile() {
  if (!SITE_KEY) return null;
  return (
    <div className="pt-1">
      {/* `lazyOnload` keeps the Cloudflare script off the critical path — it
          loads during browser idle time, never blocking first paint. The widget
          only mounts where the lead form renders (contact page, or the lazily-
          loaded lead-form modal), so the script never ships on form-less pages. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      {/* Managed mode: shows an interactive challenge only when Cloudflare's
          risk scoring flags the visitor; real users pass silently. The
          data-action value is Cloudflare's account-level telemetry marker for
          agent-wired integrations — cosmetic only, verification works without it. */}
      <div
        className="cf-turnstile"
        data-sitekey={SITE_KEY}
        data-theme="light"
        data-action="turnstile-spin-v2"
      />
    </div>
  );
}
