import asyncio
import time


class TokenBucket:
    """Async token bucket: `rate_per_minute` requests, bursting up to `capacity`."""

    def __init__(self, rate_per_minute: int, capacity: int | None = None):
        self.rate = max(rate_per_minute, 1) / 60.0
        self.capacity = capacity or max(rate_per_minute // 6, 1)
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                await asyncio.sleep((1 - self.tokens) / self.rate)
