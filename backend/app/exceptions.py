"""Custom domain exceptions (plan §5.3/§3.7). Mapped to HTTP responses in
app.error_handlers — never raised as raw HTTPException from inside a service,
so the same exception type works for both the API layer and future callers
(e.g. the Phase-2 batch backfill) that aren't HTTP requests at all.
"""


class DomainError(Exception):
    """Base for every exception raised from the service layer."""


class BlockingRuleViolation(DomainError):
    """A BLOCKING-mode rule failed — the write must not happen. -> HTTP 422."""

    def __init__(self, failures: list):
        self.failures = failures
        super().__init__(f"{len(failures)} blocking rule violation(s)")


class StockInsufficient(BlockingRuleViolation):
    """Specifically the issue>stock invariant (plan §5.3)."""


class MonthLocked(DomainError):
    """Attempted write against a finalized period. -> HTTP 409."""

    def __init__(self, year: int, month: int):
        self.year = year
        self.month = month
        super().__init__(f"period {year}-{month:02d} is finalized and locked")


class ProjectMismatch(DomainError):
    """A row's project_id disagrees with the caller's scoped project. -> HTTP 403.
    This should never be reachable through the API (verify_project_access
    prevents it), so hitting it means a bug, not a user error.
    """

    def __init__(self, got: str, expected: str):
        self.got = got
        self.expected = expected
        super().__init__(f"project mismatch: got {got}, expected {expected}")


class NotFoundError(DomainError):
    """Requested row does not exist (or isn't visible under RLS). -> HTTP 404."""
