from fastapi import FastAPI

from app.error_handlers import register_error_handlers
from app.routers import (
    abstract,
    admin,
    auth,
    bbs_plan,
    dashboard,
    exceptions,
    grn,
    inter_site_transfer,
    jmr_actual,
    masters,
    month_close,
    physical_count,
    projects,
    scrap_sale,
    store_issue,
    upstream,
)

app = FastAPI(title="Steel Reconciliation Platform", version="0.1.0")

register_error_handlers(app)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(masters.router)
app.include_router(projects.router)
app.include_router(upstream.router)
app.include_router(grn.router)
app.include_router(store_issue.router)
app.include_router(inter_site_transfer.router)
app.include_router(bbs_plan.router)
app.include_router(jmr_actual.router)
app.include_router(physical_count.router)
app.include_router(scrap_sale.router)
app.include_router(abstract.router)
app.include_router(month_close.router)
app.include_router(dashboard.router)
app.include_router(exceptions.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
