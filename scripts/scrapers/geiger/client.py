"""HTTP client + rate limiter for the Geiger scraper."""

from __future__ import annotations

import time
from types import TracebackType
from typing import Any

import httpx
from curl_cffi import requests as curl_requests
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .config import (
    MAX_RETRIES,
    REQUEST_TIMEOUT_SECONDS,
    RETRY_BACKOFF_MULTIPLIER,
    THROTTLE_SECONDS,
    USER_AGENT,
)


class RateLimiter:
    """Single-threaded throttle: ensures at least THROTTLE_SECONDS between requests."""

    def __init__(self, min_interval: float = THROTTLE_SECONDS) -> None:
        self._min_interval = min_interval
        self._last_request_at: float | None = None

    def wait(self) -> None:
        now = time.monotonic()
        if self._last_request_at is not None:
            elapsed = now - self._last_request_at
            remaining = self._min_interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_at = time.monotonic()


def _is_retryable_status(exc: BaseException) -> bool:
    """Retry on 5xx and transport errors, never on 4xx.

    SCRAPE-910: this predicate is now actually wired into tenacity (via
    retry_if_exception). The original code retried on the exception TYPE
    (httpx.HTTPStatusError) regardless of status, so a deterministic 403
    from Cloudflare's bot challenge was hammered five times with ~30s of
    backoff before failing. A 4xx now fails on the first attempt.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return 500 <= exc.response.status_code < 600
    return isinstance(exc, (httpx.RequestError, httpx.TimeoutException))


# Response headers worth carrying into an error message. cf-mitigated is the
# smoking gun for a Cloudflare bot challenge (SCRAPE-900); retry-after matters
# for rate limits; cf-ray/server identify the edge that answered.
_EVIDENCE_HEADERS = ("cf-mitigated", "cf-ray", "retry-after", "server", "content-type")
_BODY_SNIPPET_CHARS = 300


def _response_evidence(response: Any) -> dict[str, Any]:
    """Extract loggable evidence from a failed response, never raising.

    Returns {"summary": str, "headers": dict, "body_snippet": str}. The
    summary is a single bracketed suffix for the exception message so the
    next blocked run is self-explanatory straight from the job log.
    """
    headers: dict[str, str] = {}
    body_snippet = ""
    try:
        raw_headers = getattr(response, "headers", None) or {}
        for name in _EVIDENCE_HEADERS:
            value = raw_headers.get(name)
            if value:
                headers[name] = str(value)
        text = getattr(response, "text", "") or ""
        body_snippet = " ".join(text[:_BODY_SNIPPET_CHARS].split())
    except Exception:  # noqa: BLE001 - evidence must never mask the real error
        pass
    parts = [f"{k}: {v}" for k, v in headers.items()]
    if body_snippet:
        parts.append(f"body[:{_BODY_SNIPPET_CHARS}]: {body_snippet}")
    summary = f" [{'; '.join(parts)}]" if parts else ""
    return {"summary": summary, "headers": headers, "body_snippet": body_snippet}


class ScraperClient:
    """Wraps httpx HTTP/2 client with rate limiting and retry."""

    def __init__(self) -> None:
        # curl_cffi impersonates a real Chrome TLS fingerprint so Cloudflare
        # bot-detection on geiger.com lets the request through.
        self._client = curl_requests.Session(impersonate="chrome131")
        self._client.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;q=0.9,"
                    "image/avif,image/webp,*/*;q=0.8"
                ),
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            }
        )
        self._limiter = RateLimiter()

    def __enter__(self) -> "ScraperClient":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        # SCRAPE-910: retry on the PREDICATE (5xx / transport errors), not on the
        # exception type. A 4xx (e.g. Cloudflare's 403 bot challenge) is
        # deterministic and now fails fast on the first attempt.
        wait=wait_exponential(multiplier=RETRY_BACKOFF_MULTIPLIER, min=1, max=30),
        retry=retry_if_exception(_is_retryable_status),
        reraise=True,
    )
    def _do_get(self, url: str, params: dict[str, Any] | None = None) -> Any:
        response = self._client.get(
            url, params=params, timeout=REQUEST_TIMEOUT_SECONDS, allow_redirects=True
        )
        if response.status_code >= 400:
            # Convert curl_cffi failure into the httpx exception type the
            # rest of the pipeline already handles, so retry/error logic
            # downstream keeps working unchanged.
            #
            # SCRAPE-910: preserve the evidence. The original code raised a
            # synthetic EMPTY response, discarding the real headers and body,
            # which is why the run #3 log could only say "403" and the
            # Cloudflare challenge had to be re-diagnosed from scratch
            # (SCRAPE-900). Keep the salient headers and a body snippet in
            # both the message and the attached response.
            evidence = _response_evidence(response)
            request = httpx.Request("GET", url)
            httpx_response = httpx.Response(
                status_code=response.status_code,
                request=request,
                headers=evidence["headers"],
                content=evidence["body_snippet"].encode("utf-8", "replace"),
            )
            raise httpx.HTTPStatusError(
                f"{response.status_code} for {url}{evidence['summary']}",
                request=request,
                response=httpx_response,
            )
        return response

    def get(
        self, url: str, params: dict[str, Any] | None = None
    ) -> Any:
        self._limiter.wait()
        return self._do_get(url, params)

    def get_json(
        self, url: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        response = self.get(url, params=params)
        return response.json()
