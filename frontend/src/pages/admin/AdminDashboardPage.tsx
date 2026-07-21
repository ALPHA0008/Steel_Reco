import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowLeftRight, Building2, PackageOpen, Recycle, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HealthGauge } from "@/components/app/health-gauge"
import { StatTile } from "@/components/app/stat-tile"
import { InsightsPanel } from "@/components/app/insights-panel"
import { Sparkline } from "@/components/app/sparkline"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { useAdminAnalytics } from "@/lib/queries"
import type { AnalyticsSite } from "@/lib/types"

function fmtMT(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

const RISK_CHIP: Record<AnalyticsSite["risk"], string> = {
  low: "bg-success-subtle text-success",
  medium: "bg-info-subtle text-info",
  high: "bg-warning-subtle text-warning",
  critical: "bg-danger-subtle text-danger",
}

/** Rich site card — name/location, health, wastage vs cap, sparkline, stats. */
function SiteCard({ site, onOpen }: { site: AnalyticsSite; onOpen: () => void }) {
  const w = site.wastage_pct
  const tone = w == null ? "muted" : site.over_cap ? "danger" : "success"
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-(--shadow-card) transition-all",
        "hover:border-brand-border hover:shadow-[0_4px_24px_rgba(20,20,22,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand-text">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{site.name}</div>
            {site.location && <div className="truncate text-[11.5px] text-muted-foreground">{site.location}</div>}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", RISK_CHIP[site.risk])}>
          {site.risk}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">Wastage</div>
          <div
            className={cn(
              "tnum font-display text-[24px] font-semibold leading-none tracking-tight",
              tone === "danger" && "text-danger",
              tone === "success" && "text-success",
            )}
          >
            {w == null ? "—" : `${w.toFixed(2)}%`}
          </div>
        </div>
        <span className={cn("flex h-9 w-[120px] items-end justify-end", tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-muted-foreground")}>
          {site.spark.length >= 2 ? (
            <Sparkline data={site.spark} width={120} height={34} />
          ) : w != null ? (
            <span className="text-[10px] font-medium text-muted-foreground">single reading</span>
          ) : null}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <div>
          <div className="tnum text-[13px] font-semibold text-foreground">{fmtMT(site.received_mt)}</div>
          <div className="text-[10.5px] text-muted-foreground">MT recv</div>
        </div>
        <div>
          <div className="tnum text-[13px] font-semibold text-foreground">{site.health}</div>
          <div className="text-[10.5px] text-muted-foreground">health</div>
        </div>
        <div>
          <div className={cn("tnum text-[13px] font-semibold", site.open_exceptions > 0 ? "text-foreground" : "text-muted-foreground")}>
            {site.open_exceptions.toLocaleString("en-IN")}
          </div>
          <div className="text-[10.5px] text-muted-foreground">flags</div>
        </div>
      </div>
    </button>
  )
}

/** Executive admin dashboard: hero (health + KPIs) -> insights -> sites ->
 * analytics. Everything reads from the single cached analytics payload. */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const q = useAdminAnalytics()
  const navigate = useNavigate()
  const data = q.data

  const sites = useMemo(() => data?.sites ?? [], [data])
  const openSite = (id: string) => navigate(`/admin/sites/${id}`)

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

      {/* ============ Sites ============ */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Sites</h2>
        <span className="text-xs text-muted-foreground">{sites.length} sites · click to open</span>
      </div>
      {q.isLoading ? (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : sites.length === 0 ? (
        <Card className="mb-8">
          <EmptyState icon={<Building2 />} title="No sites yet" description="Sites appear here once their ledgers are imported." />
        </Card>
      ) : (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {sites.map((s) => (
            <SiteCard key={s.project_id} site={s} onOpen={() => openSite(s.project_id)} />
          ))}
        </div>
      )}

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
