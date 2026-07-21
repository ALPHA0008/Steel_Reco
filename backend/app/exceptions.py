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


class CorrectionScopeMismatch(DomainError):
    """A correction tried to change the physical identity (tower/floor/element/
    dia) of the row it supersedes -> HTTP 422. A correction re-states HOW MUCH
    was measured, never WHAT was measured -- otherwise 'Correct' becomes a lever
    to vanish one entry and substitute an unrelated one under a correction's
    audit label. A wrong-scope original is fixed by correcting its weight to 0
    and entering the right row fresh, keeping both moves visible.
    """

    def __init__(self, field: str, original: str, attempted: str):
        self.field = field
        super().__init__(
            f"correction must keep the original's {field} "
            f"(original {original}, attempted {attempted}); "
            "corrections re-state the measurement, never the element it belongs to"
        )


class AlreadyCorrected(DomainError):
    """Attempted to correct a row that another row already supersedes -> HTTP 409.
    Corrections must form a chain (A<-B<-C), never a fork (B and C both
    correcting A) -- a fork would make both replacements count in the Abstract
    at once, silently double-counting the re-stated quantity.
    """

    def __init__(self, row_id: str, superseded_by: str):
        self.row_id = row_id
        self.superseded_by = superseded_by
        super().__init__(f"row {row_id} was already corrected by {superseded_by}; correct that row instead")
