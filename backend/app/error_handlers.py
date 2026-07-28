from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.exceptions import (
    AlreadyCorrected,
    BlockingRuleViolation,
    CorrectionScopeMismatch,
    MonthLocked,
    NotFoundError,
    ProjectMismatch,
)
from app.services.exception_service import (
    CorrectionNotVerified,
    FollowUpDateInvalid,
    FollowUpDateRequired,
    ResolverNameRequired,
)
from app.services.month_close_service import (
    AlreadyFinalized,
    FutureMonthFinalize,
    NotFinalized,
    UnansweredExceptions,
)


def _envelope(code: str, message: str, details: list | None = None) -> dict:
    """ECC error envelope (plan §6): {"error": {"code","message","details"}}."""
    return {"error": {"code": code, "message": message, "details": details or []}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(BlockingRuleViolation)
    async def _blocking_rule(request: Request, exc: BlockingRuleViolation) -> JSONResponse:
        details = [
            {
                "rule_id": f.rule_id,
                "message": f.message,
                "threshold": str(f.threshold) if f.threshold is not None else None,
                "actual_value": str(f.actual_value) if f.actual_value is not None else None,
            }
            for f in exc.failures
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("blocking_rule_violation", str(exc), details),
        )

    @app.exception_handler(MonthLocked)
    async def _month_locked(request: Request, exc: MonthLocked) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=_envelope("month_locked", str(exc)))

    @app.exception_handler(ProjectMismatch)
    async def _project_mismatch(request: Request, exc: ProjectMismatch) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=_envelope("project_mismatch", str(exc)))

    @app.exception_handler(NotFoundError)
    async def _not_found(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=_envelope("not_found", str(exc)))

    @app.exception_handler(AlreadyCorrected)
    async def _already_corrected(request: Request, exc: AlreadyCorrected) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=_envelope("already_corrected", str(exc)))

    @app.exception_handler(CorrectionScopeMismatch)
    async def _correction_scope_mismatch(request: Request, exc: CorrectionScopeMismatch) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("correction_scope_mismatch", str(exc)),
        )

    @app.exception_handler(AlreadyFinalized)
    async def _already_finalized(request: Request, exc: AlreadyFinalized) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=_envelope("already_finalized", str(exc)))

    @app.exception_handler(NotFinalized)
    async def _not_finalized(request: Request, exc: NotFinalized) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=_envelope("not_finalized", str(exc)))

    @app.exception_handler(FutureMonthFinalize)
    async def _future_month(request: Request, exc: FutureMonthFinalize) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("future_month_finalize", str(exc)),
        )

    @app.exception_handler(UnansweredExceptions)
    async def _unanswered_exceptions(request: Request, exc: UnansweredExceptions) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope(
                "unanswered_exceptions", str(exc), [{"unanswered_count": exc.count}]
            ),
        )

    @app.exception_handler(CorrectionNotVerified)
    async def _correction_not_verified(request: Request, exc: CorrectionNotVerified) -> JSONResponse:
        """The QS said "corrected" but re-running the rule shows the data still
        violates it. Refusing is the whole point -- a claim isn't a fix."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("correction_not_verified", str(exc)),
        )

    @app.exception_handler(ResolverNameRequired)
    async def _resolver_name_required(request: Request, exc: ResolverNameRequired) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("resolver_name_required", str(exc)),
        )

    @app.exception_handler(FollowUpDateRequired)
    async def _follow_up_required(request: Request, exc: FollowUpDateRequired) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("follow_up_date_required", str(exc)),
        )

    @app.exception_handler(FollowUpDateInvalid)
    async def _follow_up_invalid(request: Request, exc: FollowUpDateInvalid) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("follow_up_date_invalid", str(exc)),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        """A bad foreign key (e.g. a to_project_id that doesn't exist) or a
        CHECK constraint violation not already caught by Pydantic validation
        (defense in depth, plan §3.2) previously surfaced as a raw 500 --
        caught live via the smoke test. This is deliberately generic (not one
        handler per constraint) since new FK/CHECK constraints are added
        across the schema as it grows; the DB's own error message is
        preserved for debugging without leaking the full SQL statement.
        """
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("data_integrity_error", str(exc.orig) if exc.orig else str(exc)),
        )
