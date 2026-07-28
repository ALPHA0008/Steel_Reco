import { lazy, Suspense, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, ArrowLeftRight, Building2, PackageOpen, Recycle, TriangleAlert, X } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/app/stat-tile"
import { ExecutiveSummary } from "@/components/app/executive-summary"
import { IntelligenceHub } from "@/components/app/intelligence-hub"
import { ProjectCarousel } from "@/components/app/project-carousel"
import { CommandPalette } from "@/components/app/command-palette"
import { SiteExplorer } from "@/pages/admin/SiteExplorer"
import { SiteDrawer } from "@/pages/admin/SiteDrawer"
import { FilterContext, applyFilter } from "@/pages/admin/dashboard-filter"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { useAdminAnalytics } from "@/lib/queries"
import type { AnalyticsSite } from "@/lib/types"
import type { ContributionUnit } from "@/components/app/charts/contribution-donut"

// Six visualisations pulling in recharts (~343KB) and leaflet. Imported
// statically, none of the page -- not even the KPI tiles -- could paint until
// all of it had downloaded and parsed, which is what made this screen sit on
// skeletons. Each now loads on demand behind its own fallback, so the numbers
// and site cards appear immediately and the charts fill in as they arrive.
const PortfolioTrend = lazy(() =>
  import("@/components/app/charts/portfolio-trend").then((m) => ({ default: m.PortfolioTrend })),
)
const SankeyFlow = lazy(() =>
  import("@/components/app/charts/sankey").then((m) => ({ default: m.SankeyFlow })),
)
const ScatterChart = lazy(() =>
  import("@/components/app/charts/scatter").then((m) => ({ default: m.ScatterChart })),
)
const SteelDistributionBars = lazy(() =>
  import("@/components/app/charts/steel-distribution").then((m) => ({
    default: m.SteelDistributionBars,
  })),
)
const RiskHeatmap = lazy(() =>
  import("@/components/app/charts/heatmap").then((m) => ({ default: m.RiskHeatmap })),
)
const LeafletSiteMap = lazy(() =>
  import("@/components/app/charts/leaflet-site-map").then((m) => ({ default: m.LeafletSiteMap })),
)
const ContributionDonut = lazy(() =>
  import("@/components/app/charts/contribution-donut").then((m) => ({
    default: m.ContributionDonut,
  })),
)

/** Placeholder while a chart's chunk is in flight. Takes the height the chart
 *  will occupy so nothing below it jumps when the real thing mounts. */
function ChartFallback({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />
}


/** A subheading for a section — no heavy card chrome, just rhythm. */
function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h2>
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** A flat analytics panel (no nested card-in-card): title + content on the
 * page surface with a hairline separator. */
function Panel({ title, sub, children, className }: { title: string; sub?: string; children: ReactNode; className?: string }) {
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
  const toggleFilter = (s: AnalyticsSite) => setSiteId(siteId === s.project_id ? null : s.project_id)

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

        {/* ============ Hero row: narrative (half) + site map (half) ============ */}
        {q.isLoading || !data ? (
          <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Skeleton className="h-[360px] rounded-3xl" />
            <Skeleton className="h-[360px] rounded-3xl" />
          </div>
        ) : (
          <div className="mb-6 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <ExecutiveSummary n={data.narrative} onOpenDriver={openSite} />
            <Card className="gap-0 overflow-hidden p-5 shadow-(--shadow-card)">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[13.5px] font-semibold tracking-tight">Site map</div>
                <span className="text-[11px] text-muted-foreground">click a pin to filter</span>
              </div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Real coordinates</div>
              <Suspense fallback={<ChartFallback height={272} />}>
                <LeafletSiteMap sites={allSites} height={272} activeId={siteId} onOpen={toggleFilter} />
              </Suspense>
            </Card>
          </div>
        )}

        {/* ============ Active filter bar ============ */}
        {filteredSite && (
          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-brand-border bg-brand-subtle px-4 py-2.5">
            <span className="text-[12px] font-medium text-brand-text">Filtered to</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-[12.5px] font-semibold text-foreground shadow-sm">
              <Building2 className="size-3.5 text-brand-text" />
              {filteredSite.name}
            </span>
            <span className="hidden text-[12px] text-muted-foreground sm:inline">— every metric below reflects this site only.</span>
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
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Received" numericValue={agg.recv} unit="MT" icon={<PackageOpen />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Issued" numericValue={agg.issued} unit="MT" icon={<ArrowLeftRight />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Scrap Sold" numericValue={agg.scrap} unit="MT" icon={<Recycle />} format={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <StatTile label="Wastage" numericValue={agg.wastage ?? 0} unit="%" tone={agg.overCap > 0 ? "danger" : "success"} icon={<TriangleAlert />} format={(v) => v.toFixed(2)} />
            <StatTile label="Open Exceptions" numericValue={agg.exceptions} icon={<AlertTriangle />} tone={agg.exceptions > 0 ? "warning" : "neutral"} format={(v) => Math.round(v).toLocaleString("en-IN")} />
          </div>
        )}

        {/* ============ Project gallery (horizontal scroll, real site photos) ============ */}
        {q.isLoading || !data ? (
          <Skeleton className="mb-8 h-[300px] rounded-2xl" />
        ) : (
          <div className="mb-8">
            <ProjectCarousel sites={allSites} onOpen={openSiteObj} />
          </div>
        )}

        {/* ============ Intelligence hub: insights + actions + alerts + activity ============ */}
        {q.isLoading || !data ? (
          <Skeleton className="mb-10 h-[380px] rounded-2xl" />
        ) : (
          <div className="mb-10">
            <IntelligenceHub
              insights={data.insights}
              actions={data.recommended_actions}
              sites={sites}
              timeline={siteId ? data.timeline.filter((t) => t.project_id === siteId) : data.timeline}
              onOpenSite={openSite}
              onOpenSiteObj={openSiteObj}
            />
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

        {/* ============ Operational analytics: 5 charts, spaced to avoid crowding ============ */}
        {data && (
          <>
            <SectionTitle>Operational analytics</SectionTitle>

            {/* Row 1: the two "what's the story" charts, side by side */}
            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Portfolio wastage trend & forecast" sub="Monthly mean across reporting sites · 3-mo moving average · next-month projection">
                {data.portfolio_trend.length >= 2 ? (
                  <Suspense fallback={<ChartFallback />}>
                    <PortfolioTrend points={data.portfolio_trend} forecast={data.portfolio_forecast_pct} />
                  </Suspense>
                ) : (
                  <div className="py-12 text-center text-[13px] text-muted-foreground">Not enough history for a trend yet.</div>
                )}
              </Panel>
              <Panel title="Material flow" sub={`Received → issued → consumed → scrap (MT)${filteredSite ? ` · ${filteredSite.name}` : ""}`}>
                <Suspense fallback={<ChartFallback />}>
                  <SankeyFlow received={agg.recv} issued={agg.issued} consumed={sites.reduce((a, s) => a + s.consumed_mt, 0)} scrap={agg.scrap} balance={agg.recv - sites.reduce((a, s) => a + s.consumed_mt, 0) - agg.scrap} />
                </Suspense>
              </Panel>
            </div>

            {/* Row 2: distribution (wide) + scatter (narrower) -- the treemap needs
                horizontal room to stay legible, so it leads a 3:2 split. */}
            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
              <Panel title="Steel distribution" sub="Steel received by site · ranked · color = health · click to filter">
                <Suspense fallback={<ChartFallback />}>
                  <SteelDistributionBars sites={allSites} activeId={siteId} onOpen={toggleFilter} />
                </Suspense>
              </Panel>
              <Panel title="Volume vs wastage" sub="click a bubble to filter">
                <Suspense fallback={<ChartFallback />}>
                  <ScatterChart sites={allSites} activeId={siteId} onOpen={toggleFilter} />
                </Suspense>
              </Panel>
            </div>

            {/* Row 3: heatmap alone, full width -- it needs the horizontal space
                for 15 months and 6 sites without squeezing cells. */}
            <div className="mb-5">
              <Panel title="Risk heatmap" sub="Wastage intensity by site & month · click a site to filter">
                <Suspense fallback={<ChartFallback height={300} />}>
                  <RiskHeatmap sites={allSites} onOpen={toggleFilter} />
                </Suspense>
              </Panel>
            </div>

            {/* ============ Contribution panels: one Pareto card, three tabs, instead
                of three parallel bordered boxes repeating the same layout. ============ */}
            <SectionTitle>Portfolio contribution</SectionTitle>
            <ContributionPareto data={data} allSites={allSites} siteId={siteId} onToggleFilter={toggleFilter} />
          </>
        )}
      </Page>
    </FilterContext.Provider>
  )
}

type ParetoKey = "wastage" | "scrap" | "exceptions"
const PARETO_META: Record<
  ParetoKey,
  { label: string; sub: string; unit: ContributionUnit; totalLabel: string }
> = {
  wastage: {
    label: "Wastage",
    sub: "Share of portfolio wastage by site · click a slice to filter",
    unit: "MT",
    totalLabel: "Total wastage",
  },
  scrap: {
    label: "Scrap",
    sub: "Share of portfolio scrap by site · click a slice to filter",
    unit: "MT",
    totalLabel: "Total scrap",
  },
  exceptions: {
    label: "Exceptions",
    sub: "Share of open flags by site · click a slice to filter",
    unit: "count",
    totalLabel: "Open flags",
  },
}

/** The three contribution Pareto views (wastage/scrap/exceptions), consolidated
 * into one card with a small tab switcher instead of three parallel boxes that
 * repeat the same visual shape three times. */
function ContributionPareto({
  data,
  allSites,
  siteId,
  onToggleFilter,
}: {
  data: NonNullable<ReturnType<typeof useAdminAnalytics>["data"]>
  allSites: AnalyticsSite[]
  siteId: string | null
  onToggleFilter: (s: AnalyticsSite) => void
}) {
  const [key, setKey] = useState<ParetoKey>("wastage")
  const rows = data.pareto[key]

  return (
    <Panel title={`${PARETO_META[key].label} contribution`} sub={PARETO_META[key].sub}>
      <div className="mb-4 flex gap-1.5">
        {(Object.keys(PARETO_META) as ParetoKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKey(k)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
              key === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {PARETO_META[k].label}
          </button>
        ))}
      </div>
      <Suspense fallback={<ChartFallback height={210} />}>
        <ContributionDonut
          rows={rows}
          allSites={allSites}
          unit={PARETO_META[key].unit}
          totalLabel={PARETO_META[key].totalLabel}
          activeId={siteId}
          onToggleFilter={onToggleFilter}
        />
      </Suspense>
    </Panel>
  )
}
