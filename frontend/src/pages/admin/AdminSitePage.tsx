import { Link, useParams } from "react-router-dom"
import { ArrowLeft, ArrowLeftRight, LineChart, PackageOpen, Recycle, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { KpiCard } from "@/components/app/kpi"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { WastageTrendArea } from "@/components/app/wastage-trend-area"
import { apiErrorMessage } from "@/lib/api"
import { useAdminSites, useAdminSiteSummary, useAdminSiteWastageTrend } from "@/lib/queries"

function mt(kg: string): string {
  return (parseFloat(kg) / 1000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Admin per-site view: the same headline + wastage-trend a QS sees on their
 * own dashboard, but admin-scoped to any site and framed with a breadcrumb
 * back to the portfolio. */
export function AdminSitePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const sites = useAdminSites()
  const summary = useAdminSiteSummary(projectId)
  const trend = useAdminSiteWastageTrend(projectId)

  const site = (sites.data ?? []).find((s) => s.project_id === projectId)
  const capPct = site ? parseFloat(site.contract_wastage_pct) : 3.0
  const wastage = summary.data?.wastage_pct == null ? null : parseFloat(summary.data.wastage_pct)
  const overCap = wastage != null && wastage > capPct

  return (
    <Page>
      <div className="mb-4 flex items-center gap-2 text-[13px] text-muted-foreground">
        <Link to="/admin" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
          <ArrowLeft className="size-3.5" /> All sites
        </Link>
        <span>/</span>
        <span>{site?.name ?? "Site"}</span>
      </div>

      <PageHeader
        title={site?.name ?? "Site"}
        description={
          summary.data
            ? `${summary.data.period_label} · cumulative since project start${site?.location ? ` · ${site.location}` : ""}`
            : "Loading this site's position…"
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/admin">Admin dashboard</Link>
          </Button>
        }
      />

      {summary.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(summary.error, "Could not load this site's summary.")}
        </Banner>
      )}

      <div className="mb-5 grid grid-cols-4 gap-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : summary.data ? (
          <>
            <KpiCard label="Net Received" value={mt(summary.data.total_received_kg)} unit="MT" icon={<PackageOpen />} chip="Cumulative" />
            <KpiCard label="Issued to Contractors" value={mt(summary.data.total_issued_kg)} unit="MT" icon={<ArrowLeftRight />} chip="Genuine sum of issues" chipTone="info" />
            <KpiCard label="Scrap Sold" value={mt(summary.data.total_scrap_sold_kg)} unit="MT" icon={<Recycle />} chip="Section N" />
            <KpiCard
              label="Wastage"
              value={wastage == null ? "—" : `${wastage.toFixed(2)}%`}
              tone={overCap ? "danger" : wastage != null ? "success" : undefined}
              icon={<TriangleAlert />}
              chip={wastage == null ? "Needs consumption data" : overCap ? `▲ over ${capPct}% cap` : `within ${capPct}% cap`}
              chipTone={wastage == null ? "neutral" : overCap ? "danger" : "success"}
            />
          </>
        ) : null}
      </div>

      <Card className="py-0 shadow-(--shadow-card)">
        <div className="border-b px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight">Wastage trend</h2>
        </div>
        {trend.isLoading ? (
          <Skeleton className="m-5 h-[220px] rounded-lg" />
        ) : trend.data && trend.data.points.length > 0 ? (
          <div className="p-5">
            <WastageTrendArea points={trend.data.points} capPct={parseFloat(trend.data.contract_wastage_cap_pct)} />
          </div>
        ) : (
          <EmptyState
            icon={<LineChart />}
            title="No trend yet"
            description="The month-by-month wastage curve appears once this site's ledger history is imported."
          />
        )}
      </Card>
    </Page>
  )
}
