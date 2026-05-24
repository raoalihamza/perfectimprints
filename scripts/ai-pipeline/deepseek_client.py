"""DeepSeek-V3 client wrapper (M2-201).

Thin client around the DeepSeek chat completions API. Build-time use only.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
import orjson
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

# DeepSeek V3 standard-tier pricing (USD per 1M tokens).
INPUT_COST_USD_PER_M = 0.27
OUTPUT_COST_USD_PER_M = 1.10

BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_TIMEOUT = 120.0

logger = logging.getLogger("deepseek_client")


class DeepSeekError(RuntimeError):
    pass


class DeepSeekRateLimitError(DeepSeekError):
    """Raised on 429 so tenacity retries with backoff."""


class DeepSeekTransientError(DeepSeekError):
    """5xx or network blip — retriable."""


@dataclass
class GenerationResult:
    content: dict[str, Any]
    tokens_in: int
    tokens_out: int
    cost_cents: float
    duration_ms: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_cents": self.cost_cents,
            "duration_ms": self.duration_ms,
        }


def _calc_cost_cents(tokens_in: int, tokens_out: int) -> float:
    usd = (tokens_in / 1_000_000) * INPUT_COST_USD_PER_M + (
        tokens_out / 1_000_000
    ) * OUTPUT_COST_USD_PER_M
    return round(usd * 100, 5)


def _log_retry(state: RetryCallState) -> None:
    exc = state.outcome.exception() if state.outcome else None
    logger.warning(
        "DeepSeek retry %d/%d after %s",
        state.attempt_number,
        3,
        type(exc).__name__ if exc else "unknown",
    )


class DeepSeekClient:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        model: str = DEFAULT_MODEL,
        dry_run: bool = False,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY")
        if not dry_run and not self.api_key:
            raise DeepSeekError(
                "DEEPSEEK_API_KEY not set. Pass api_key explicitly or set the env var."
            )
        self.model = model
        self.dry_run = dry_run
        self._client = httpx.Client(
            base_url=BASE_URL,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "DeepSeekClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.85,
        max_tokens: int = 2400,
    ) -> GenerationResult:
        if self.dry_run:
            rendered = (
                "==== SYSTEM ====\n"
                f"{system_prompt}\n"
                "==== USER ====\n"
                f"{user_prompt}\n"
            )
            print(rendered)
            return GenerationResult(
                content={"_dry_run": True},
                tokens_in=0,
                tokens_out=0,
                cost_cents=0.0,
                duration_ms=0,
            )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        return self._call(payload)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type(
            (DeepSeekRateLimitError, DeepSeekTransientError, httpx.HTTPError)
        ),
        before_sleep=_log_retry,
        reraise=True,
    )
    def _call(self, payload: dict[str, Any]) -> GenerationResult:
        started = time.perf_counter()
        try:
            response = self._client.post("/v1/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise DeepSeekTransientError(f"network error: {exc}") from exc

        if response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            if retry_after:
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = 5.0
                logger.warning("429 rate limit; sleeping %.1fs per retry-after", delay)
                time.sleep(min(delay, 30.0))
            raise DeepSeekRateLimitError("rate limited")

        if 500 <= response.status_code < 600:
            raise DeepSeekTransientError(
                f"server error {response.status_code}: {response.text[:200]}"
            )

        if response.status_code >= 400:
            raise DeepSeekError(
                f"api error {response.status_code}: {response.text[:500]}"
            )

        duration_ms = int((time.perf_counter() - started) * 1000)
        data = response.json()
        usage = data.get("usage", {})
        tokens_in = int(usage.get("prompt_tokens", 0))
        tokens_out = int(usage.get("completion_tokens", 0))
        cost_cents = _calc_cost_cents(tokens_in, tokens_out)

        try:
            raw_text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise DeepSeekError(f"unexpected response shape: {data}") from exc

        try:
            content = orjson.loads(raw_text)
        except orjson.JSONDecodeError as exc:
            raise DeepSeekError(
                f"model returned non-JSON despite json_object format: {raw_text[:300]}"
            ) from exc

        logger.info(
            "deepseek ok: %dms in=%d out=%d cost=%.3f¢",
            duration_ms,
            tokens_in,
            tokens_out,
            cost_cents,
        )

        return GenerationResult(
            content=content,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_cents=cost_cents,
            duration_ms=duration_ms,
        )


if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    dry = "--dry-run" in sys.argv
    with DeepSeekClient(dry_run=dry) as client:
        result = client.generate(
            system_prompt='You output JSON. Reply with {"ok": true, "echo": <user message>}.',
            user_prompt='Say "hello"',
        )
        print(orjson.dumps(result.as_dict(), option=orjson.OPT_INDENT_2).decode())
