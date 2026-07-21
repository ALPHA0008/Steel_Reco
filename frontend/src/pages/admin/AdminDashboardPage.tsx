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

  const maxWastage = useMemo(() => Math.max(3, ...sites.map((s) => s.wastage_pct ?? 0)), [sites])

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

      {/* ============ Analytics (Phase 4 will expand this) ============ */}
      {data && (
        <>
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Analytics</h2>
          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Wastage vs cap</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Each site against its 3% contract cap</div>
              <div className="space-y-2.5">
                {sites.map((s) => {
                  const w = s.wastage_pct ?? 0
                  return (
                    <button key={s.project_id} type="button" onClick={() => openSite(s.project_id)} className="block w-full text-left">
                      <div className="mb-0.5 flex items-center justify-between text-[12px]">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className={cn("tnum font-semibold", s.over_cap ? "text-danger" : "text-success")}>{w.toFixed(2)}%</span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("absolute inset-y-0 left-0 rounded-full", s.over_cap ? "bg-danger" : "bg-success")} style={{ width: `${Math.max(2, (w / maxWastage) * 100)}%` }} />
                        <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${(s.cap_pct / maxWastage) * 100}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Wastage contribution (Pareto)</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Which sites drive total wastage</div>
              <div className="space-y-1">
                {data.pareto.wastage.map((r) => (
                  <div key={r.name} className="rounded-lg p-2">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="tnum text-muted-foreground">{r.cumulative_pct.toFixed(0)}% cum</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand/70" style={{ width: `${data.pareto.wastage[0].value > 0 ? (r.value / data.pareto.wastage[0].value) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
              <div className="mb-1 text-[13px] font-semibold">Open exceptions by site</div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">Unresolved flags needing review</div>
              <div className="space-y-1">
                {[...sites].sort((a, b) => b.open_exceptions - a.open_exceptions).map((s) => {
                  const max = Math.max(1, ...sites.map((x) => x.open_exceptions))
                  return (
                    <button key={s.project_id} type="button" onClick={() => openSite(s.project_id)} className="block w-full rounded-lg p-2 text-left transition-colors hover:bg-row-hover">
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="tnum font-semibold text-foreground">{s.open_exceptions.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand/70" style={{ width: `${(s.open_exceptions / max) * 100}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </Page>
  )
}
