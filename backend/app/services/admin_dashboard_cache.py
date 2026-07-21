"""In-process cache for the admin multi-site dashboard.

WHY a cache: the admin dashboard spans every site, and each site's headline
numbers + wastage trend are COMPUTED live from the ledger (the Abstract is
never stored -- plan §0). Computing all six sites on every page view took
4-17s. This cache computes each site's snapshot once and serves it in
microseconds, refreshing in the background past a TTL.

WHY in-process (no DB table / migration): keeps the existing schema untouched
(explicit user constraint) and needs no migration. The trade-off -- the cache
is empty after a server restart and warms on the first request -- is fine for
a read-only analytics dashboard: the numbers are always derivable from the
ledger, never authoritative here.

Correctness: the cached numbers are byte-identical to a live compute (same
AbstractService calls); the cache only changes WHEN they're computed, never
WHAT. A mutation to any site's ledger won't reflect until the TTL lapses or
invalidate() is called -- acceptable for a monitoring view, and the TTL is
short enough (default 5 min) that a demo never sees stale figures.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from decimal import Decimal

from app.schemas.admin import AdminSiteSummary
from app.schemas.abstract import WastageTrendResponse

# How long a computed snapshot is served before a refresh is triggered.
TTL_SECONDS = 300.0


@dataclass
class _SiteSnapshot:
    summary: AdminSiteSummary
    trend: WastageTrendResponse
    # Current-month wastage-qty (L) and consumption+WIP (G) totals, kept so the
    # portfolio wastage can be an exact Sigma L / Sigma G, not an average of %.
    l_total: Decimal
    g_total: Decimal
    computed_at: float


@dataclass
class _Cache:
    sites: dict[str, _SiteSnapshot] = field(default_factory=dict)
    # project_id (str) -> snapshot; plus a global "computed the full set" stamp
    full_set_at: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # The full executive-analytics payload (build_admin_analytics()).
    analytics: dict | None = None
    analytics_at: float = 0.0
    analytics_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_cache = _Cache()


def is_fresh(ts: float) -> bool:
    return (time.monotonic() - ts) < TTL_SECONDS


def get_analytics() -> dict | None:
    if _cache.analytics is not None and is_fresh(_cache.analytics_at):
        return _cache.analytics
    return None


def put_analytics(payload: dict) -> None:
    _cache.analytics = payload
    _cache.analytics_at = time.monotonic()


def analytics_lock() -> asyncio.Lock:
    return _cache.analytics_lock


def get_site(project_id: str) -> _SiteSnapshot | None:
    snap = _cache.sites.get(project_id)
    if snap and is_fresh(snap.computed_at):
        return snap
    return None


def get_site_any(project_id: str) -> _SiteSnapshot | None:
    """The cached snapshot regardless of freshness -- used when backfilling a
    trend onto an already-cached summary (or vice versa) so we don't clobber
    the other half."""
    return _cache.sites.get(project_id)


def put_site(
    project_id: str,
    summary: AdminSiteSummary,
    trend: WastageTrendResponse,
    l_total: Decimal,
    g_total: Decimal,
) -> None:
    _cache.sites[project_id] = _SiteSnapshot(
        summary=summary, trend=trend, l_total=l_total, g_total=g_total, computed_at=time.monotonic()
    )


def all_fresh_snapshots() -> list[_SiteSnapshot] | None:
    """Every site's full snapshot iff the whole set is fresh, else None."""
    if not _cache.sites or not is_fresh(_cache.full_set_at):
        return None
    snaps = [s for s in _cache.sites.values() if is_fresh(s.computed_at)]
    return snaps or None


def all_fresh_summaries() -> list[AdminSiteSummary] | None:
    """Return every site's cached summary iff the whole set is fresh; else
    None (caller must recompute)."""
    if not _cache.sites or not is_fresh(_cache.full_set_at):
        return None
    snaps = [s for s in _cache.sites.values() if is_fresh(s.computed_at)]
    if not snaps:
        return None
    return [s.summary for s in snaps]


def mark_full_set() -> None:
    _cache.full_set_at = time.monotonic()


def invalidate() -> None:
    """Drop everything -- call after a known data change to force recompute."""
    _cache.sites.clear()
    _cache.full_set_at = 0.0
    _cache.analytics = None
    _cache.analytics_at = 0.0


def lock() -> asyncio.Lock:
    return _cache.lock
