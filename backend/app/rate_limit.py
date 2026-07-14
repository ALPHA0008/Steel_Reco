import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    """Sliding-window rate limiter, keyed by (client IP, route key).

    In-process only -- correct for this app's single-worker deployment, but
    would need a shared store (Redis) behind multiple workers/processes,
    since each process would otherwise track its own independent window.
    Deliberately simple rather than pulling in a new dependency for a check
    this small; revisit if the app is ever scaled to multiple workers.
    """

    def __init__(self, *, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        """Raises HTTP 429 if `key` has exceeded max_attempts within the
        window; otherwise records this attempt and returns.
        """
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_attempts:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many attempts. Please wait before trying again.",
            )
        hits.append(now)


def client_ip(request: Request) -> str:
    """Best-effort client identity for rate-limit keying. Trusts
    X-Forwarded-For only because this app is not yet deployed behind a
    verified reverse proxy; revisit (parse the trusted-proxy chain properly)
    once a real proxy topology exists.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Separate limiter instances: login is brute-force-prone (attacker knows a
# username, guesses passwords); signup is abuse-prone (spinning up accounts
# / hammering a guessed signup code). Different budgets for each.
login_rate_limiter = InMemoryRateLimiter(max_attempts=10, window_seconds=60)
signup_rate_limiter = InMemoryRateLimiter(max_attempts=5, window_seconds=60)
