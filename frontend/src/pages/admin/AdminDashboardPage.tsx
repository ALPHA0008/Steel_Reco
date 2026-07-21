import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Building2, PackageOpen, Recycle, TriangleAlert, X } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/app/stat-tile"
import { ExecutiveSummary } from "@/components/app/executive-summary"
import { InsightsPanel } from "@/components/app/insights-panel"
import { AlertsCenter } from "@/components/app/alerts-center"
import { OperationalTimeline } from "@/components/app/timeline"
import { CommandPalette } from "@/components/app/command-palette"
import { SiteExplorer } from "@/pages/admin/SiteExplorer"
import { SiteDrawer } from "@/pages/admin/SiteDrawer"
import { FilterContext, applyFilter } from "@/pages/admin/dashboard-filter"
import { PortfolioTrend } from "@/components/app/charts/portfolio-trend"
import { SankeyFlow } from "@/components/app/charts/sankey"
import { ScatterChart } from "@/components/app/charts/scatter"
import { Treemap, TreemapLegend } from "@/components/app/charts/treemap"
import { RiskHeatmap } from "@/components/app/charts/heatmap"
import { GeoMap } from "@/components/app/charts/geo-map"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { useAdminAnalytics } from "@/lib/queries"
import type { AnalyticsSite } from "@/lib/types"

/** A subheading for an analytics section — no heavy card chrome, just rhythm. */
function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h2>
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** A flat analytics panel (no nested card-in-card): title + content on the
 * page surface with a hairline separator, per the depth/spacing overhaul. */
function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/50 bg-card p-5", className)}>
      <div className="mb-1 text-[13.5px] font-semibold tracking-tight">{title}</div>
      {sub && <div className="mb-4 text-[11.5px] text-muted-foreground">{sub}</div>}
      {children}
    </div>
  )
}

/** Executive intelligence dashboard. Narrative-first, cross-filtered: selecting
 * a site anywhere re-scopes the whole page. One cached analytics payload. */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const q = useAdminAnalytics()
  const data = q.data

  const allSites = useMemo(() => data?.sites ?? [], [data])
  const [siteId, setSiteId] = useState<string | null>(null)
  const [drawerSite, setDrawerSite] = useState<AnalyticsSite | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // filtered view of the sites (identity when no filter)
  const sites = useMemo(() => applyFilter(allSites, siteId), [allSites, siteId])
  const filteredSite = siteId ? allSites.find((s) => s.project_id === siteId) ?? null : null

  const filterCtx = useMemo(
    () => ({ siteId, setSiteId, isActive: (id: string) => !siteId || siteId === id }),
    [siteId],
  )

  const openSiteObj = (s: AnalyticsSite) => { setDrawerSite(s); setDrawerOpen(true) }
  const openSite = (id: string) => { const s = allSites.find((x) => x.project_id === id); if (s) openSiteObj(s) }

  // scoped portfolio aggregates (recompute when filtered to one site)
  const agg = useMemo(() => {
    const recv = sites.reduce((a, s) => a + s.received_mt, 0)
    const issued = sites.reduce((a, s) => a + s.issued_mt, 0)
    const scrap = sites.reduce((a, s) => a + s.scrap_mt, 0)
    const consumed = sites.reduce((a, s) => a + s.consumed_mt, 0)
    const l = sites.reduce((a, s) => a + s.wastage_qty_mt, 0)
    const overCap = sites.filter((s) => s.over_cap).length
    const exceptions = sites.reduce((a, s) => a + s.open_exceptions, 0)
    const wastage = consumed > 0 ? (l / consumed) * 100 : null
    return { recv, issued, scrap, wastage, overCap, exceptions }
  }, [sites])

  if (q.isError) {
    return (
      <Page>
        <PageHeader title="Admin dashboard" description="Company-wide reconciliation across every site" />
        <Banner variant="blocking">{apiErrorMessage(q.error, "Could not load the portfolio analytics.")}</Banner>
      </Page>
    )
  }

  return (
    <FilterContext.Provider value={filterCtx}>
      <Page>
        <PageHeader
          title="Admin dashboard"
          description={`Company-wide operational intelligence · signed in as ${user?.full_name ?? "admin"}`}
          actions={
            <kbd className="hidden items-center gap-1 rounded-lg border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm sm:inline-flex">
              <span className="text-[13px]">⌘</span>K
            </kbd>
          }
        />

        {data && <CommandPalette sites={allSites} onFilterSite={setSiteId} onOpenSite={openSite} />}

        {/* ============ Executive narrative hero ============ */}
        {q.isLoading || !data ? (
          <Skeleton className="mb-6 h-[260px] rounded-3xl" />
        ) : (
          <div className="mb-6">
            <ExecutiveSummary n={data.narrative} onOpenDriver={openSite} />
          </div>
        )}

        {/* ============ Active filter bar ============ */}
        {filteredSite && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-brand-border bg-brand-subtle px-4 py-2.5">
            <span className="text-[12px] font-medium text-brand-text">Filtered to</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-[12.5px] font-semibold text-foreground shadow-sm">
              <Building2 className="size-3.5 text-brand-text" />
              {filteredSite.name}
            </span>
            <span className="text-[12px] text-muted-foreground">— every metric below reflects this site only.</span>
            <button
              type="button"
              onClick={() => setSiteId(null)}
              className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-brand-text transition-colors hover:bg-card"
            >
              <X className="size-3.5" /> Clear
            </button>
          </div>
        )}

        {/* ============ KPI strip (scoped) ============ */}
        {q.isLoading || !data ? (
          <div className="mb-8 grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-5 gap-4">
            <StatTile label="Received" numericValue={agg.recv} unit="MT" icon={<PackageOpen />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Issued" numericValue={agg.issued} unit="MT" icon={<ArrowLeftRight />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Scrap Sold" numericValue={agg.scrap} unit="MT" icon={<Recycle />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Wastage" numericValue={agg.wastage ?? 0} unit="%" tone={agg.overCap > 0 ? "danger" : "success"} icon={<TriangleAlert />} format={(v) => v.toFixed(2)} />
            <StatTile label="Open Exceptions" numericValue={agg.exceptions} icon={<AlertTriangle />} tone={agg.exceptions > 0 ? "warning" : "neutral"} format={(v) => Math.round(v).toLocaleString("en-IN")} />
          </div>
        )}

        {/* ============ Insights + actions ============ */}
        {q.isLoading || !data ? (
          <Skeleton className="mb-10 h-[220px] rounded-2xl" />
        ) : (
          <div className="mb-10">
            <InsightsPanel insights={data.insights} actions={data.recommended_actions} onOpenSite={openSite} />
          </div>
        )}

        {/* ============ Alerts + timeline ============ */}
        {q.isLoading || !data ? (
          <Skeleton className="mb-10 h-[300px] rounded-2xl" />
        ) : (
          <div className="mb-10 grid grid-cols-2 gap-5">
            <AlertsCenter sites={sites} onOpen={openSiteObj} />
            <Panel title="Operational timeline">
              <div className="max-h-[340px] overflow-y-auto pr-1">
                <OperationalTimeline items={siteId ? data.timeline.filter((t) => t.project_id === siteId) : data.timeline} />
              </div>
            </Panel>
          </div>
        )}

        {/* ============ Site performance explorer ============ */}
        <SectionTitle hint="click a row for the full breakdown · click any chart element to cross-filter">Site performance</SectionTitle>
        {q.isLoading ? (
          <Skeleton className="mb-10 h-[360px] rounded-2xl" />
        ) : (
          <div className="mb-10">
            <SiteExplorer sites={allSites} onOpen={openSiteObj} activeId={siteId} onFilter={setSiteId} />
          </div>
        )}

        <SiteDrawer site={drawerSite} open={drawerOpen} onOpenChange={setDrawerOpen} />

        {/* ============ Operational analytics ============ */}
        {data && (
          <>
            <SectionTitle>Operational analytics</SectionTitle>

            <div className="mb-5 grid grid-cols-[1.5fr_1fr] gap-5">
              <Panel title="Portfolio wastage trend & forecast" sub="Monthly mean across reporting sites · 3-mo moving average · next-month projection">
                {data.portfolio_trend.length >= 2 ? (
                  <PortfolioTrend points={data.portfolio_trend} forecast={data.portfolio_forecast_pct} />
                ) : (
                  <div className="py-12 text-center text-[13px] text-muted-foreground">Not enough history for a trend yet.</div>
                )}
              </Panel>
              <Panel title="Material flow" sub={`Received → issued → consumed → scrap (MT)${filteredSite ? ` · ${filteredSite.name}` : ""}`}>
                <SankeyFlow received={agg.recv} issued={agg.issued} consumed={sites.reduce((a, s) => a + s.consumed_mt, 0)} scrap={agg.scrap} balance={agg.recv - sites.reduce((a, s) => a + s.consumed_mt, 0) - agg.scrap} />
              </Panel>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-5">
              <Panel title="Volume vs wastage" sub="Are the biggest sites the ones bleeding wastage? · click a bubble to filter">
                <ScatterChart sites={allSites} activeId={siteId} onOpen={(s) => setSiteId(siteId === s.project_id ? null : s.project_id)} />
              </Panel>
              <Panel title="Steel distribution" sub="Share of steel volume across sites · click to filter">
                <Treemap sites={allSites} onOpen={(s) => setSiteId(siteId === s.project_id ? null : s.project_id)} />
                <TreemapLegend />
              </Panel>
            </div>

            <div className="mb-5 grid grid-cols-[1.4fr_1fr] gap-5">
              <Panel title="Risk heatmap" sub="Wastage intensity by site & month · click a site to filter">
                <RiskHeatmap sites={allSites} onOpen={(s) => setSiteId(siteId === s.project_id ? null : s.project_id)} />
              </Panel>
              <Panel title="Site map" sub="Bubble = steel volume · color = health · click to filter">
                <GeoMap sites={allSites} onOpen={(s) => setSiteId(siteId === s.project_id ? null : s.project_id)} />
              </Panel>
            </div>

            <div className="grid grid-cols-3 gap-5">
              {([
                { key: "wastage", title: "Wastage contribution", sub: "Which sites drive total wastage" },
                { key: "scrap", title: "Scrap contribution", sub: "Which sites drive scrap" },
                { key: "exceptions", title: "Exception contribution", sub: "Which sites drive open flags" },
              ] as const).map(({ key, title, sub }) => {
                const rows = data.pareto[key]
                const top = rows[0]?.value || 1
                return (
                  <Panel key={key} title={title} sub={sub}>
                    <div className="space-y-1.5">
                      {rows.map((r) => {
                        const site = allSites.find((s) => s.name === r.name)
                        return (
                          <button
                            key={r.name}
                            type="button"
                            onClick={() => site && setSiteId(siteId === site.project_id ? null : site.project_id)}
                            className={cn("block w-full rounded-lg p-1.5 text-left transition-colors hover:bg-row-hover", siteId && site?.project_id === siteId && "bg-brand-subtle")}
                          >
                            <div className="mb-1 flex items-center justify-between text-[12px]">
                              <span className="truncate font-medium">{r.name}</span>
                              <span className="tnum text-muted-foreground">{r.cumulative_pct.toFixed(0)}% cum</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-brand/70" style={{ width: `${(r.value / top) * 100}%` }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </Panel>
                )
              })}
            </div>
          </>
        )}
      </Page>
    </FilterContext.Provider>
  )
}
