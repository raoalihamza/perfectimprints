"""Resumable checkpointing for long-running scrape phases."""

from __future__ import annotations

import os
from typing import Any

import orjson

from .config import CHECKPOINT_DIR


class CheckpointManager:
    """Reads and writes per-phase checkpoint files atomically."""

    def __init__(self, phase: str) -> None:
        self._phase = phase
        self._path = CHECKPOINT_DIR / f"phase-{phase}.json"

    @property
    def path(self):
        return self._path

    def load(self) -> dict[str, Any] | None:
        if not self._path.exists():
            return None
        with open(self._path, "rb") as f:
            return orjson.loads(f.read())

    def save(self, state: dict[str, Any]) -> None:
        tmp = self._path.with_suffix(".json.tmp")
        with open(tmp, "wb") as f:
            f.write(orjson.dumps(state, option=orjson.OPT_INDENT_2))
        os.replace(tmp, self._path)

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()
