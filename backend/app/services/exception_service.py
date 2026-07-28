import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import DomainError, NotFoundError
from app.models.system import ExceptionLog
from app.repositories.exception_repository import ExceptionRepository
from app.services.audit_service import AuditService
from app.services.exception_revalidation_service import ExceptionRevalidationService


class CorrectionNotVerified(DomainError):
    """A "corrected" claim was re-checked and the data still violates the rule.
    -> HTTP 422. The whole point of validation: the exception does NOT resolve
    on the strength of the claim alone."""


class ResolverNameRequired(DomainError):
    """A resolution with no named person behind it. -> HTTP 422. Site accounts
    are shared per project, so "resolved by qs_testproject" records a login, not
    a decision-maker."""


class FollowUpDateRequired(DomainError):
    """follow_up with no target date. -> HTTP 422. An open-ended "I'll get to
    it" is exactly what this is meant to stop."""


class FollowUpDateInvalid(DomainError):
    """A follow-up date in the past, or so far out that it lands after the
    period would need to be closed. -> HTTP 422."""


def _end_of_next_month(today: date) -> date:
    """Last day of the month AFTER today -- the furthest out a follow-up may be
    promised, so a commitment can't outrun the period close it blocks."""
    year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    nxt_year, nxt_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return date(nxt_year, nxt_month, 1) - timedelta(days=1)


class ExceptionService:
    """Resolve flow for rules-engine output (plan §6), with validation.

    Resolving used to believe whatever was typed. Now each path has to earn it:

      corrected  -- the SAME rule is re-run against current data. Still
                    failing => rejected (CorrectionNotVerified) and the
                    exception stays open. Where a rule genuinely cannot be
                    re-derived after the fact, that is stated rather than
                    faked, and the outcome is recorded as an explicit
                    acceptance instead of a verified fix.
      approved   -- resolves immediately, but the reason is mandatory: the
                    system flagged this and a human is consciously overriding
                    it, which is precisely what the audit trail is for.
      follow_up  -- NOT a resolution. Requires a target date, moves the row to
                    'pending', and it re-surfaces once that date passes. It has
                    to become corrected or approved eventually, following the
                    two rules above.
    """

    def __init__(
        self,
        session: AsyncSession,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        user_role: str | None = None,
    ) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        # From the authenticated session, never from the request body -- a
        # self-declared role would be a claim rather than a fact.
        self._user_role = user_role
        self._repo = ExceptionRepository(session, project_id=project_id)
        self._revalidator = ExceptionRevalidationService(session, project_id)
        self._audit = AuditService(session)

    async def list(self, status_filter: str | None = None) -> list[ExceptionLog]:
        # Surfacing the list is also when overdue commitments come back, so an
        # expired follow-up can't sit quietly in 'pending' forever.
        await self.reopen_overdue(commit=False)
        rows = await self._repo.list_by_status(status_filter)
        # Commit the reopens only after reading. set_rls_context() uses
        # transaction-scoped set_config, so committing first would drop the RLS
        # GUCs and the read would then match nothing -- which is exactly how
        # this surfaced: reopened rows existed in the table but came back as an
        # empty queue.
        await self._session.commit()
        return rows

    async def resolve(
        self,
        exception_id: uuid.UUID,
        resolution_type: str,
        reason: str,
        follow_up_due_date: date | None = None,
        resolver_name: str | None = None,
    ) -> ExceptionLog:
        row = await self._repo.get(exception_id)
        if row is None:
            raise NotFoundError(f"exception_log {exception_id} not found")

        now = datetime.now(timezone.utc)

        # Every path is signed. Site logins are shared per project, so
        # resolved_by names an account and not a person; without this the audit
        # trail cannot say who actually made the call.
        signed_name = (resolver_name or "").strip()
        if not signed_name:
            raise ResolverNameRequired(
                "Who is making this decision? Site logins are shared, so the record needs the "
                "name of the person deciding, not just the account."
            )
        row.resolver_name = signed_name
        row.resolver_role = self._user_role

        if resolution_type == "follow_up":
            self._validate_follow_up_date(follow_up_due_date)
            assert follow_up_due_date is not None  # narrowed by the validator above
            # Pending, NOT resolved: still unanswered, still blocks finalize,
            # and it comes back once the promised date passes.
            row.status = "pending"
            row.resolution_type = "follow_up"
            row.resolver_reason = reason
            row.follow_up_due_date = follow_up_due_date
            row.validation_state = "pending"
            row.validated_at = None
            row.resolved_by = self._user_id
            row.resolved_at = None
            audit_action = "UPDATE"
            detail = f"follow-up committed for {follow_up_due_date.isoformat()}"

        elif resolution_type == "corrected":
            outcome = await self._revalidator.revalidate(row)
            if outcome.checkable and not outcome.passed:
                # Refused -- the row is left exactly as it was.
                raise CorrectionNotVerified(outcome.detail)
            row.status = "resolved"
            row.resolution_type = "corrected"
            row.resolver_reason = reason
            row.validation_state = "verified" if outcome.passed else "accepted"
            row.validated_at = now
            row.resolved_by = self._user_id
            row.resolved_at = now
            row.follow_up_due_date = None
            audit_action = "CORRECT"
            detail = outcome.detail

        elif resolution_type == "approved":
            row.status = "resolved"
            row.resolution_type = "approved"
            row.resolver_reason = reason
            row.validation_state = "accepted"
            row.validated_at = now
            row.resolved_by = self._user_id
            row.resolved_at = now
            row.follow_up_due_date = None
            audit_action = "UPDATE"
            detail = "accepted as-is by explicit sign-off"

        else:  # pragma: no cover -- the schema pattern already rejects this
            raise DomainError(f"unknown resolution_type '{resolution_type}'")

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="exception_log",
            row_id=row.id,
            action=audit_action,
            after_json={
                "rule_name": row.rule_name,
                "status": row.status,
                "resolution_type": row.resolution_type,
                "validation_state": row.validation_state,
                "follow_up_due_date": row.follow_up_due_date.isoformat() if row.follow_up_due_date else None,
                "detail": detail,
                # The signature belongs in the audit row too -- exception_log
                # holds only the latest decision, so without this a name is lost
                # the moment an overdue follow-up is re-answered by someone else.
                "resolver_name": row.resolver_name,
                "resolver_role": row.resolver_role,
            },
        )
        await self._session.commit()
        # Deliberately no session.refresh(): set_rls_context() uses
        # transaction-scoped set_config, so commit() clears the RLS GUCs and a
        # refresh() re-SELECT fails closed even though the UPDATE succeeded.
        # Every field on `row` is already correct in memory.
        return row

    def _validate_follow_up_date(self, due: date | None) -> None:
        if due is None:
            raise FollowUpDateRequired(
                "A follow-up needs a target date -- when will this be resolved? Without one it is "
                "an open-ended deferral, not a commitment."
            )
        today = datetime.now(timezone.utc).date()
        if due < today:
            raise FollowUpDateInvalid(
                f"The follow-up date {due.isoformat()} is in the past. Pick a date you can still meet."
            )
        horizon = _end_of_next_month(today)
        if due > horizon:
            raise FollowUpDateInvalid(
                f"The follow-up date {due.isoformat()} is beyond {horizon.isoformat()}, which is too far "
                "out to close the books against. Commit to a date within the current or next month, or "
                "resolve this now as corrected or approved."
            )

    async def reopen_overdue(self, commit: bool = True) -> list[ExceptionLog]:
        """Put pending follow-ups whose promised date has passed back in the
        queue, with a warning naming the date that was missed. Run on list read,
        so an overdue commitment resurfaces without needing a scheduler.

        `commit=False` lets a caller that still needs to read within this
        transaction defer the commit -- committing drops the RLS GUCs (see
        list()), so the order matters.
        """
        overdue = await self._repo.list_overdue_pending(datetime.now(timezone.utc).date())
        for row in overdue:
            missed = row.follow_up_due_date.isoformat() if row.follow_up_due_date else "an earlier date"
            row.status = "open"
            row.reopened_count = (row.reopened_count or 0) + 1
            row.validation_state = None
            # resolver_name is deliberately NOT cleared: it names whoever made
            # the promise that lapsed, which is the useful thing to know when it
            # comes back. Whoever answers it next overwrites it, and the audit
            # log keeps both.
            promised_by = f" by {row.resolver_name}" if row.resolver_name else ""
            row.message = (
                f"{row.message or ''}\n[Overdue] This was committed{promised_by} for {missed} and is "
                "still unresolved. Decide now: correct the record, or approve it as-is with a reason."
            ).strip()
        if overdue:
            await self._session.flush()
            if commit:
                await self._session.commit()
        return overdue
