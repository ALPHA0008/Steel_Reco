import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, PackageOpen, Recycle, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { KpiCard } from "@/components/app/kpi"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkline } from "@/components/app/sparkline"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { useAdminSites, useAdminMasterSummary } from "@/lib/queries"
import type { AdminSiteSummary } from "@/lib/types"

function mt(kg: string | null | undefined): string {
  if (kg == null) return "—"
  return (parseFloat(kg) / 1000).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function pct(v: string | null): string {
  return v == null ? "—" : `${parseFloat(v).toFixed(2)}%`
}

/** One rich site card: name/location, big wastage % + cap chip, sparkline,
 * and a compact stat row. Whole card is the click target into the site. */
function SiteCard({ site, onOpen }: { site: AdminSiteSummary; onOpen: () => void }) {
  const w = site.wastage_pct == null ? null : parseFloat(site.wastage_pct)
  const cap = parseFloat(site.contract_wastage_pct)
  const tone = w == null ? "muted" : site.over_cap ? "danger" : "success"

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-(--shadow-card) transition-all",
        "hover:border-brand-border hover:shadow-[0_4px_20px_rgba(20,20,22,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            tone === "danger" && "bg-danger-subtle text-danger",
            tone === "success" && "bg-success-subtle text-success",
            tone === "muted" && "bg-muted text-muted-foreground",
          )}
        >
          {w == null ? "no data" : site.over_cap ? `▲ over ${cap.toFixed(0)}%` : `within ${cap.toFixed(0)}%`}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">Wastage</div>
          <div
            className={cn(
              "tnum font-display text-[26px] font-semibold leading-none tracking-tight",
              tone === "danger" && "text-danger",
              tone === "success" && "text-success",
            )}
          >
            {w == null ? "—" : `${w.toFixed(2)}%`}
          </div>
        </div>
        <span
          className={cn(
            "flex h-9 w-[132px] items-end justify-end",
            tone === "danger" && "text-danger",
            tone === "success" && "text-success",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {site.wastage_spark.length >= 2 ? (
            <Sparkline data={site.wastage_spark} />
          ) : w != null ? (
            // Single-reading sites (e.g. APAS): no series to spark, so show a
            // tiny cap meter instead of empty space -- the card still reads as
            // a visualization, consistent with the others.
            <span className="flex w-full flex-col items-end gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">single close reading</span>
              <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (w / (cap * 1.6)) * 100)}%`, background: "currentColor" }} />
                <span className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${Math.min(100, (cap / (cap * 1.6)) * 100)}%` }} />
              </span>
            </span>
          ) : null}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <div>
          <div className="tnum text-[13px] font-semibold text-foreground">{mt(site.total_received_kg)}</div>
          <div className="text-[10.5px] text-muted-foreground">MT received</div>
        </div>
        <div>
          <div className="tnum text-[13px] font-semibold text-foreground">{mt(site.total_scrap_sold_kg)}</div>
          <div className="text-[10.5px] text-muted-foreground">MT scrap</div>
        </div>
        <div>
          <div className={cn("tnum text-[13px] font-semibold", site.open_exceptions > 0 ? "text-foreground" : "text-muted-foreground")}>
            {site.open_exceptions.toLocaleString("en-IN")}
          </div>
          <div className="text-[10.5px] text-muted-foreground">exceptions</div>
        </div>
      </div>
    </button>
  )
}

/** Horizontal proportion bar for a metric across sites (analytics section). */
function ProportionRow({ label, value, max, display, onClick }: { label: string; value: number; max: number; display: string; onClick?: () => void }) {
  const widthPct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-lg p-2 text-left transition-colors hover:bg-row-hover">
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5 font-medium">
          <Building2 className="size-3 text-muted-foreground" />
          {label}
        </span>
        <span className="tnum font-semibold text-foreground">{display}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand/70" style={{ width: `${widthPct}%` }} />
      </div>
    </button>
  )
}

/** Merged admin dashboard: portfolio KPIs -> rich site cards -> analytics.
 * "All Sites" and "Master Dashboard" are one page now. */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const sites = useAdminSites()
  const master = useAdminMasterSummary()
  const navigate = useNavigate()

  const rows = useMemo(() => sites.data ?? [], [sites.data])
  const maxWastage = useMemo(
    () => Math.max(3, ...rows.map((s) => (s.wastage_pct ? parseFloat(s.wastage_pct) : 0))),
    [rows],
  )
  const maxReceived = useMemo(() => Math.max(1, ...rows.map((s) => parseFloat(s.total_received_kg))), [rows])
  const maxExceptions = useMemo(() => Math.max(1, ...rows.map((s) => s.open_exceptions)), [rows])

  const receivedSorted = useMemo(() => [...rows].sort((a, b) => parseFloat(b.total_received_kg) - parseFloat(a.total_received_kg)), [rows])
  const exceptionsSorted = useMemo(() => [...rows].sort((a, b) => b.open_exceptions - a.open_exceptions), [rows])

  return (
    <Page>
      <PageHeader
        title="Admin dashboard"
        description={`Company-wide reconciliation across every site · signed in as ${user?.full_name ?? "admin"}`}
      />

      {(sites.isError || master.isError) && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(sites.error ?? master.error, "Could not load the portfolio.")}
        </Banner>
      )}

      {/* Portfolio KPIs */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {master.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : master.data ? (
          <>
            <KpiCard label="Total Received" value={mt(master.data.total_received_kg)} unit="MT" icon={<PackageOpen />} chip={`${master.data.site_count} sites`} />
            <KpiCard label="Issued to Contractors" value={mt(master.data.total_issued_kg)} unit="MT" icon={<Building2 />} chip="Cumulative" chipTone="info" />
            <KpiCard label="Scrap Sold" value={mt(master.data.total_scrap_sold_kg)} unit="MT" icon={<Recycle />} chip="All sites" />
            <KpiCard
              label="Portfolio Wastage"
              value={pct(master.data.weighted_wastage_pct)}
              tone={master.data.sites_over_cap > 0 ? "danger" : "success"}
              icon={<TriangleAlert />}
              chip={`${master.data.sites_over_cap} of ${master.data.site_count} over cap`}
              chipTone={master.data.sites_over_cap > 0 ? "danger" : "success"}
            />
          </>
        ) : null}
      </div>

      {/* Site cards */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Sites</h2>
        <span className="text-xs text-muted-foreground">{rows.length} sites · click to open</span>
      </div>
      {sites.isLoading ? (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="mb-8">
          <EmptyState icon={<Building2 />} title="No sites yet" description="Sites appear here once their ledgers are imported." />
        </Card>
      ) : (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {rows.map((s) => (
            <SiteCard key={s.project_id} site={s} onOpen={() => navigate(`/admin/sites/${s.project_id}`)} />
          ))}
        </div>
      )}

      {/* Analytics */}
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Analytics</h2>
      <div className="grid grid-cols-3 gap-4">
        {/* Wastage vs cap — the key reconciliation signal */}
        <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
          <div className="mb-1 text-[13px] font-semibold">Wastage vs cap</div>
          <div className="mb-3 text-[11.5px] text-muted-foreground">Each site's % against its {rows[0] ? parseFloat(rows[0].contract_wastage_pct).toFixed(0) : 3}% contract cap</div>
          {sites.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <div className="space-y-2.5">
              {rows.map((s) => {
                const w = s.wastage_pct ? parseFloat(s.wastage_pct) : 0
                const cap = parseFloat(s.contract_wastage_pct)
                return (
                  <button key={s.project_id} type="button" onClick={() => navigate(`/admin/sites/${s.project_id}`)} className="block w-full text-left">
                    <div className="mb-0.5 flex items-center justify-between text-[12px]">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className={cn("tnum font-semibold", s.over_cap ? "text-danger" : "text-success")}>{w.toFixed(2)}%</span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("absolute inset-y-0 left-0 rounded-full", s.over_cap ? "bg-danger" : "bg-success")} style={{ width: `${Math.max(2, (w / maxWastage) * 100)}%` }} />
                      <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${(cap / maxWastage) * 100}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Received by site */}
        <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
          <div className="mb-1 text-[13px] font-semibold">Steel received by site</div>
          <div className="mb-3 text-[11.5px] text-muted-foreground">Cumulative net received (MT)</div>
          {sites.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <div className="space-y-1">
              {receivedSorted.map((s) => (
                <ProportionRow
                  key={s.project_id}
                  label={s.name}
                  value={parseFloat(s.total_received_kg)}
                  max={maxReceived}
                  display={`${mt(s.total_received_kg)} MT`}
                  onClick={() => navigate(`/admin/sites/${s.project_id}`)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Open exceptions by site */}
        <Card className="col-span-1 gap-0 p-5 shadow-(--shadow-card)">
          <div className="mb-1 text-[13px] font-semibold">Open exceptions by site</div>
          <div className="mb-3 text-[11.5px] text-muted-foreground">Unresolved flags needing review</div>
          {sites.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <div className="space-y-1">
              {exceptionsSorted.map((s) => (
                <ProportionRow
                  key={s.project_id}
                  label={s.name}
                  value={s.open_exceptions}
                  max={maxExceptions}
                  display={s.open_exceptions.toLocaleString("en-IN")}
                  onClick={() => navigate(`/admin/sites/${s.project_id}`)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  )
}
