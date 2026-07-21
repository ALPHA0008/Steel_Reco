import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Building2, PackageOpen, Recycle, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HealthGauge } from "@/components/app/health-gauge"
import { StatTile } from "@/components/app/stat-tile"
import { InsightsPanel } from "@/components/app/insights-panel"
import { SiteExplorer } from "@/pages/admin/SiteExplorer"
import { SiteDrawer } from "@/pages/admin/SiteDrawer"
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

/** Executive admin dashboard: hero (health + KPIs) -> insights -> site
 * explorer + drawer -> analytics. Everything reads from the single cached
 * analytics payload; drilling into a site opens a drawer, not a navigation. */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const q = useAdminAnalytics()
  const data = q.data

  const sites = useMemo(() => data?.sites ?? [], [data])
  const [drawerSite, setDrawerSite] = useState<AnalyticsSite | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openSite = (id: string) => {
    const s = sites.find((x) => x.project_id === id)
    if (s) {
      setDrawerSite(s)
      setDrawerOpen(true)
    }
  }
  const openSiteObj = (s: AnalyticsSite) => {
    setDrawerSite(s)
    setDrawerOpen(true)
  }

  if (q.isError) {
    return (
      <Page>
        <PageHeader title="Admin dashboard" description="Company-wide reconciliation across every site" />
        <Banner variant="blocking">{apiErrorMessage(q.error, "Could not load the portfolio analytics.")}</Banner>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="Admin dashboard"
        description={`Company-wide operational intelligence · signed in as ${user?.full_name ?? "admin"}`}
      />

      {/* ============ Executive hero ============ */}
      {q.isLoading || !data ? (
        <Skeleton className="mb-6 h-[220px] rounded-2xl" />
      ) : (
        <div className="mb-6 grid grid-cols-[auto_1fr] gap-4">
          {/* Health gauge */}
          <Card className="flex items-center justify-center px-8 py-6 shadow-(--shadow-card)">
            <HealthGauge score={data.portfolio.health} />
          </Card>

          {/* KPI grid */}
          <div className="grid grid-cols-3 grid-rows-2 gap-4">
            <StatTile
              label="Total Received"
              numericValue={data.portfolio.received_mt}
              unit="MT"
              icon={<PackageOpen />}
              spark={sites.map((s) => s.received_mt)}
              format={(n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            />
            <StatTile
              label="Issued to Contractors"
              numericValue={data.portfolio.issued_mt}
              unit="MT"
              icon={<ArrowLeftRight />}
              format={(n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            />
            <StatTile
              label="Scrap Sold"
              numericValue={data.portfolio.scrap_mt}
              unit="MT"
              icon={<Recycle />}
              format={(n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            />
            <StatTile
              label="Portfolio Wastage"
              numericValue={data.portfolio.wastage_pct ?? 0}
              unit="%"
              tone={data.portfolio.sites_over_cap > 0 ? "danger" : "success"}
              icon={<TriangleAlert />}
              progress={data.portfolio.wastage_pct ? Math.min(1, data.portfolio.wastage_pct / (3 * 1.6)) : 0}
              progressLabel={<>vs 3.0% cap</>}
              format={(n) => n.toFixed(2)}
            />
            <StatTile
              label="Sites Over Cap"
              numericValue={data.portfolio.sites_over_cap}
              unit={`/ ${data.portfolio.site_count}`}
              tone={data.portfolio.sites_over_cap > 0 ? "danger" : "success"}
              icon={<Building2 />}
              format={(n) => String(Math.round(n))}
            />
            <StatTile
              label="Open Exceptions"
              numericValue={data.portfolio.open_exceptions}
              icon={<AlertTriangle />}
              tone={data.portfolio.open_exceptions > 0 ? "warning" : "neutral"}
              format={(n) => Math.round(n).toLocaleString("en-IN")}
            />
          </div>
        </div>
      )}

      {/* ============ Insights + actions ============ */}
      {q.isLoading || !data ? (
        <Skeleton className="mb-8 h-[220px] rounded-2xl" />
      ) : (
        <div className="mb-8">
          <InsightsPanel insights={data.insights} actions={data.recommended_actions} onOpenSite={openSite} />
        </div>
      )}

      {/* ============ Site Performance Explorer ============ */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Site performance</h2>
        <span className="text-xs text-muted-foreground">click a row for the full breakdown</span>
      </div>
      {q.isLoading ? (
        <Skeleton className="mb-8 h-[360px] rounded-2xl" />
      ) : (
        <div className="mb-8">
          <SiteExplorer sites={sites} onOpen={openSiteObj} />
        </div>
      )}

      {/* Project detail drawer */}
      <SiteDrawer site={drawerSite} open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* ============ Analytics ============ */}
      {data && (
        <>
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Operational analytics</h2>

          {/* Row 1: portfolio trend + forecast (wide) · material-flow Sankey */}
          <div className="mb-4 grid grid-cols-[1.5fr_1fr] gap-4">
            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Portfolio wastage trend & forecast</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Monthly mean across reporting sites, 3-mo moving average, next-month projection</div>
              {data.portfolio_trend.length >= 2 ? (
                <PortfolioTrend points={data.portfolio_trend} forecast={data.portfolio_forecast_pct} />
              ) : (
                <div className="py-12 text-center text-[13px] text-muted-foreground">Not enough history for a trend yet.</div>
              )}
            </Card>

            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Material flow</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Received → issued → consumed → scrap (MT)</div>
              <SankeyFlow
                received={data.sankey.received_mt}
                issued={data.sankey.issued_mt}
                consumed={data.sankey.consumed_mt}
                scrap={data.sankey.scrap_mt}
                balance={data.sankey.balance_mt}
              />
            </Card>
          </div>

          {/* Row 2: scatter · treemap */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Volume vs wastage</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Are the biggest sites the ones bleeding wastage?</div>
              <ScatterChart sites={sites} onOpen={openSiteObj} />
            </Card>

            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Steel distribution</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Share of steel volume across sites</div>
              <Treemap sites={sites} onOpen={openSiteObj} />
              <TreemapLegend />
            </Card>
          </div>

          {/* Row 3: risk heatmap (wide) · geo map */}
          <div className="mb-4 grid grid-cols-[1.4fr_1fr] gap-4">
            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Risk heatmap</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Wastage intensity by site & month</div>
              <RiskHeatmap sites={sites} onOpen={openSiteObj} />
            </Card>

            <Card className="gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Site map</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Bubble = steel volume · color = health</div>
              <GeoMap sites={sites} onOpen={openSiteObj} />
            </Card>
          </div>

          {/* Row 4: Pareto (wastage / scrap / exceptions) */}
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: "wastage", title: "Wastage contribution", sub: "Which sites drive total wastage" },
              { key: "scrap", title: "Scrap contribution", sub: "Which sites drive scrap" },
              { key: "exceptions", title: "Exception contribution", sub: "Which sites drive open flags" },
            ] as const).map(({ key, title, sub }) => {
              const rows = data.pareto[key]
              const top = rows[0]?.value || 1
              return (
                <Card key={key} className="gap-0 p-5 shadow-(--shadow-card)">
                  <div className="mb-1 text-[13px] font-semibold">{title}</div>
                  <div className="mb-3 text-[11.5px] text-muted-foreground">{sub}</div>
                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.name} className="rounded-lg p-1.5">
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="tnum text-muted-foreground">{r.cumulative_pct.toFixed(0)}% cum</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-brand/70" style={{ width: `${(r.value / top) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </Page>
  )
}
