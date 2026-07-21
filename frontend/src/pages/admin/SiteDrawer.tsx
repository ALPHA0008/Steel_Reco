import { Link } from "react-router-dom"
import { ArrowUpRight, Building2, TriangleAlert } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { WastageTrendArea } from "@/components/app/wastage-trend-area"
import { WaterfallChart, WaterfallLabels } from "@/components/app/charts/waterfall"
import { cn } from "@/lib/utils"
import { useAdminSiteWastageTrend } from "@/lib/queries"
import { siteImage } from "@/lib/site-images"
import type { AnalyticsSite } from "@/lib/types"

const RISK_TONE: Record<AnalyticsSite["risk"], string> = {
  low: "bg-success-subtle text-success",
  medium: "bg-info-subtle text-info",
  high: "bg-warning-subtle text-warning",
  critical: "bg-danger-subtle text-danger",
}

function fmt(n: number, d = 1): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("tnum mt-1 text-[17px] font-semibold", tone)}>{value}</div>
    </div>
  )
}

/** Project detail side drawer — everything about one site without leaving the
 * dashboard. Tabs: Overview, Material Flow, Trend, Exceptions. */
export function SiteDrawer({
  site,
  open,
  onOpenChange,
}: {
  site: AnalyticsSite | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const trend = useAdminSiteWastageTrend(open && site ? site.project_id : undefined)
  const img = site ? siteImage(site.name) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[560px]">
        {site && (
          <>
            {/* Hero image / gradient */}
            <div className="relative h-40 w-full overflow-hidden">
              {img ? (
                <img src={img} alt={site.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-foreground to-[#3d3e40]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <span className={cn("mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", RISK_TONE[site.risk])}>
                  {site.risk} risk
                </span>
                <div className="font-display text-[22px] font-semibold leading-tight text-white">{site.name}</div>
                {site.location && <div className="text-[12px] text-white/80">{site.location}</div>}
              </div>
            </div>

            <SheetHeader className="sr-only">
              <SheetTitle>{site.name}</SheetTitle>
            </SheetHeader>

            <div className="p-5">
              <Tabs defaultValue="overview">
                <TabsList className="mb-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="flow">Material Flow</TabsTrigger>
                  <TabsTrigger value="trend">Trend</TabsTrigger>
                  <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
                    <div className="flex flex-col items-center">
                      <span
                        className="tnum font-display text-[32px] font-semibold leading-none"
                        style={{ color: site.health >= 75 ? "var(--success)" : site.health >= 55 ? "var(--info)" : site.health >= 35 ? "var(--warning)" : "var(--danger)" }}
                      >
                        {site.health}
                      </span>
                      <span className="text-[10px] text-muted-foreground">health</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] text-muted-foreground">Wastage vs {site.cap_pct.toFixed(0)}% cap</div>
                      <div className={cn("text-[20px] font-semibold", site.over_cap ? "text-danger" : "text-success")}>
                        {site.wastage_pct == null ? "—" : `${site.wastage_pct.toFixed(2)}%`}
                        {site.forecast_pct != null && (
                          <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                            → {site.forecast_pct.toFixed(2)}% next (proj.)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Net Received" value={`${fmt(site.received_mt)} MT`} />
                    <Stat label="Issued to Contractors" value={`${fmt(site.issued_mt)} MT`} />
                    <Stat label="Consumed (C+WIP)" value={`${fmt(site.consumed_mt)} MT`} />
                    <Stat label="Scrap Sold" value={`${fmt(site.scrap_mt)} MT`} />
                    <Stat label="Physical Stock" value={`${fmt(site.physical_mt)} MT`} />
                    <Stat label="Open Exceptions" value={site.open_exceptions.toLocaleString("en-IN")} tone={site.open_exceptions > 0 ? "text-foreground" : "text-muted-foreground"} />
                  </div>
                  {site.latest_activity && (
                    <div className="text-[12px] text-muted-foreground">
                      Last recorded activity: <span className="font-medium text-foreground">{site.latest_activity}</span>
                    </div>
                  )}
                </TabsContent>

                {/* Material flow — waterfall */}
                <TabsContent value="flow">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="mb-1 text-[13px] font-semibold">Material reconciliation</div>
                    <div className="mb-4 text-[11.5px] text-muted-foreground">Received → consumed → scrap → balance (MT)</div>
                    {(() => {
                      const steps = [
                        { label: "Received", value: site.received_mt, kind: "total" as const },
                        { label: "Consumed", value: -site.consumed_mt, kind: "decrease" as const },
                        { label: "Scrap", value: -site.scrap_mt, kind: "decrease" as const },
                        { label: "Balance", value: site.balance_mt, kind: "total" as const },
                      ]
                      return (
                        <>
                          <WaterfallChart steps={steps} height={200} />
                          <WaterfallLabels steps={steps} />
                        </>
                      )
                    })()}
                  </div>
                </TabsContent>

                {/* Trend */}
                <TabsContent value="trend">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="mb-3 text-[13px] font-semibold">Wastage trend</div>
                    {trend.isLoading ? (
                      <Skeleton className="h-[220px] rounded-lg" />
                    ) : trend.data && trend.data.points.length > 0 ? (
                      <WastageTrendArea points={trend.data.points} capPct={parseFloat(trend.data.contract_wastage_cap_pct)} />
                    ) : (
                      <div className="py-12 text-center text-[13px] text-muted-foreground">No trend data.</div>
                    )}
                  </div>
                </TabsContent>

                {/* Exceptions */}
                <TabsContent value="exceptions" className="space-y-2">
                  {Object.keys(site.exception_rules).length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-muted-foreground">No open exceptions.</div>
                  ) : (
                    Object.entries(site.exception_rules)
                      .sort((a, b) => b[1] - a[1])
                      .map(([rule, count]) => (
                        <div key={rule} className="flex items-center justify-between rounded-xl border bg-card p-3">
                          <span className="flex items-center gap-2 text-[13px] font-medium">
                            <TriangleAlert className="size-4 text-warning" />
                            {rule.replace(/_/g, " ")}
                          </span>
                          <span className="tnum text-[13px] font-semibold">{count.toLocaleString("en-IN")}</span>
                        </div>
                      ))
                  )}
                </TabsContent>
              </Tabs>

              <div className="mt-5 flex gap-2 border-t pt-4">
                <Button asChild className="flex-1 bg-brand text-brand-foreground hover:bg-brand-hover">
                  <Link to={`/admin/sites/${site.project_id}`}>
                    <Building2 /> Open full site page
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
