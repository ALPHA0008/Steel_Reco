import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeftRight,
  ArrowUpRight,
  LineChart,
  PackageOpen,
  Recycle,
  TriangleAlert,
} from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { formatDate } from "@/lib/format"
import { KpiCard } from "@/components/app/kpi"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { WastageTrendArea } from "@/components/app/wastage-trend-area"
import {
  useDashboardSummary,
  useDiaGrades,
  useGrns,
  useMyProject,
  useStoreIssues,
  useVendors,
  useWastageTrend,
  diaLabel,
  formatKg,
} from "@/lib/queries"

function mt(kg: string): string {
  return (parseFloat(kg) / 1000).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Landing view: this month at a glance, then straight into the work. */
export function DashboardPage() {
  const { user } = useAuth()
  const project = useMyProject()
  const summary = useDashboardSummary()
  const grns = useGrns()
  const issues = useStoreIssues()
  const vendors = useVendors()
  const dias = useDiaGrades()
  const wastageTrend = useWastageTrend()

  const vendorById = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v])), [vendors.data])
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])

  const capPct = project.data ? parseFloat(project.data.contract_wastage_pct) : 3.0
  const wastage = summary.data?.wastage_pct == null ? null : parseFloat(summary.data.wastage_pct)
  const overCap = wastage != null && wastage > capPct

  const recentGrns = (grns.data ?? []).slice(0, 5)
  const recentIssues = (issues.data ?? []).slice(0, 5)

  return (
    <Page>
      <PageHeader
        title={project.data ? project.data.name : "Dashboard"}
        description={
          summary.data
            ? `${summary.data.period_label} · cumulative since project start · signed in as ${user?.full_name ?? ""}`
            : "Loading this month's position…"
        }
      />

      {summary.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(summary.error, "Could not load the summary.")}
        </Banner>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : summary.data ? (
          <>
            <KpiCard
              label="Net Received"
              value={mt(summary.data.total_received_kg)}
              unit="MT"
              icon={<PackageOpen />}
              chip="Cumulative"
            />
            <KpiCard
              label="Issued to Contractors"
              value={mt(summary.data.total_issued_kg)}
              unit="MT"
              icon={<ArrowLeftRight />}
              chip="Genuine sum of issues"
              chipTone="info"
            />
            <KpiCard
              label="Scrap Sold"
              value={mt(summary.data.total_scrap_sold_kg)}
              unit="MT"
              icon={<Recycle />}
              chip="Section N"
            />
            <KpiCard
              label="Wastage"
              value={wastage == null ? "—" : `${wastage.toFixed(2)}%`}
              tone={overCap ? "danger" : wastage != null ? "success" : undefined}
              icon={<TriangleAlert />}
              chip={
                wastage == null
                  ? "Needs consumption data"
                  : overCap
                    ? `▲ over ${capPct}% cap`
                    : `within ${capPct}% cap`
              }
              chipTone={wastage == null ? "neutral" : overCap ? "danger" : "success"}
            />
          </>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="py-0 shadow-(--shadow-card)">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-[15px] font-semibold tracking-tight">Recent GRNs</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/grn">
                View all <ArrowUpRight />
              </Link>
            </Button>
          </div>
          {recentGrns.length === 0 && !grns.isLoading ? (
            <EmptyState title="No receipts yet" description="Recorded GRNs appear here." />
          ) : (
            <ul className="divide-y">
              {recentGrns.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(g.effective_date)}</span>
                  <span className="font-medium">{vendorById.get(g.vendor_id)?.name ?? "—"}</span>
                  <span className="text-muted-foreground">{diaLabel(diaById.get(g.dia_grade_id))}</span>
                  <span className="tnum ml-auto font-semibold">{formatKg(g.weighbridge_weight_kg)} kg</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="py-0 shadow-(--shadow-card)">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-[15px] font-semibold tracking-tight">Recent issues</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/store-issues">
                View all <ArrowUpRight />
              </Link>
            </Button>
          </div>
          {recentIssues.length === 0 && !issues.isLoading ? (
            <EmptyState title="No issues yet" description="Issues to contractors appear here." />
          ) : (
            <ul className="divide-y">
              {recentIssues.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(i.effective_date)}</span>
                  <span className="text-muted-foreground">{diaLabel(diaById.get(i.dia_grade_id))}</span>
                  <span className="tnum ml-auto font-semibold">
                    {i.direction === "in" ? "−" : ""}
                    {formatKg(i.quantity_kg)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="py-0 shadow-(--shadow-card)">
        <div className="border-b px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight">Wastage trend</h2>
        </div>
        {wastageTrend.isLoading ? (
          <Skeleton className="m-5 h-[220px] rounded-lg" />
        ) : wastageTrend.data && wastageTrend.data.points.length > 0 ? (
          <div className="p-5">
            <WastageTrendArea
              points={wastageTrend.data.points}
              capPct={parseFloat(wastageTrend.data.contract_wastage_cap_pct)}
            />
          </div>
        ) : (
          <EmptyState
            icon={<LineChart />}
            title="Trend appears once history is imported"
            description="The Abstract is cumulative from project start — the month-by-month wastage curve against the cap unlocks when the legacy ledger is backfilled."
          />
        )}
      </Card>
    </Page>
  )
}
