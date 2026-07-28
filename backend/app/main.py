import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.error_handlers import register_error_handlers
from app.routers import (
    abstract,
    admin,
    admin_sites,
    auth,
    bbs_plan,
    dashboard,
    exceptions,
    grn,
    inter_site_transfer,
    jmr_actual,
    masters,
    month_close,
    myhome_stock,
    physical_count,
    projects,
    scrap_sale,
    store_issue,
    upstream,
)

logger = logging.getLogger("uvicorn.error")


async def _warm_admin_dashboard_cache() -> None:
    """Precompute the admin multi-site dashboard in the background at startup so
    the first admin page view is instant instead of waiting on a live compute of
    every site's Abstract + trend. Best-effort: any failure is logged and
    ignored (the endpoints fall back to computing on demand)."""
    try:
        from app.database import async_session_factory, set_rls_context
        from app.routers.admin_sites import _warm_all

        async with async_session_factory() as session:
            await set_rls_context(session, user_id=None, user_role="admin")
            await _warm_all(session)
        logger.info("Admin dashboard cache warmed.")
    except Exception as exc:  # noqa: BLE001 -- warming is best-effort
        logger.warning("Admin dashboard cache warm failed (will compute on demand): %s", exc)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_warm_admin_dashboard_cache())
    yield
    if not task.done():
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Steel Reconciliation Platform", version="0.1.0", lifespan=lifespan)

register_error_handlers(app)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin_sites.router)
app.include_router(masters.router)
app.include_router(projects.router)
app.include_router(upstream.router)
app.include_router(grn.router)
app.include_router(store_issue.router)
app.include_router(inter_site_transfer.router)
app.include_router(bbs_plan.router)
app.include_router(jmr_actual.router)
app.include_router(physical_count.router)
app.include_router(myhome_stock.router)
app.include_router(scrap_sale.router)
app.include_router(abstract.router)
app.include_router(month_close.router)
app.include_router(dashboard.router)
app.include_router(exceptions.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
