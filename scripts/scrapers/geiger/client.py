"""HTTP client + rate limiter for the Geiger scraper."""

from __future__ import annotations

import time
from types import TracebackType
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
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
    """Retry on 5xx but not 4xx."""
    if isinstance(exc, httpx.HTTPStatusError):
        return 500 <= exc.response.status_code < 600
    return isinstance(exc, (httpx.RequestError, httpx.TimeoutException))


class ScraperClient:
    """Wraps httpx HTTP/2 client with rate limiting and retry."""

    def __init__(self) -> None:
        self._client = httpx.Client(
            http2=True,
            headers={
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
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            follow_redirects=True,
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
        wait=wait_exponential(multiplier=RETRY_BACKOFF_MULTIPLIER, min=1, max=30),
        retry=retry_if_exception_type(
            (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException)
        ),
        reraise=True,
    )
    def _do_get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        response = self._client.get(url, params=params)
        if response.status_code >= 400:
            response.raise_for_status()
        return response

    def get(
        self, url: str, params: dict[str, Any] | None = None
    ) -> httpx.Response:
        self._limiter.wait()
        try:
            return self._do_get(url, params)
        except httpx.HTTPStatusError as e:
            # 4xx errors are not retryable - re-raise immediately for caller handling.
            if not _is_retryable_status(e):
                raise
            raise

    def get_json(
        self, url: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        response = self.get(url, params=params)
        return response.json()
