import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.services.model_gateway.base import ProviderError

T = TypeVar("T")
log = logging.getLogger(__name__)


async def with_retries(fn: Callable[[], Awaitable[T]], *, max_retries: int, base_delay: float = 1.0) -> T:
    """Retry retryable ProviderErrors (429/5xx/timeouts) with exponential backoff and jitter."""
    attempt = 0
    while True:
        try:
            return await fn()
        except ProviderError as e:
            if not e.retryable or attempt >= max_retries:
                raise
            delay = min(base_delay * 2**attempt, 30) * (0.5 + random.random())
            log.warning("model call failed (%s), retry %d in %.1fs", e, attempt + 1, delay)
            await asyncio.sleep(delay)
            attempt += 1
