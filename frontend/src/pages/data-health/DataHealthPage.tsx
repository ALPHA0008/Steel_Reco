import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useDataHealth } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SectionHealth } from "@/lib/types"

/**
 * Per-section data-completeness panel (design intent: this knowledge should
 * live in the app, not only in a memory file and a QS's head). Every figure
 * elsewhere in the app is trustworthy on its own terms, but "trustworthy on
 * its own terms" and "a real April count" are not the same claim -- this
 * page is honest about which is which, per section.
 */

const STATUS_STYLE: Record<SectionHealth["status"], { label: string; className: string }> = {
  real: { label: "Real data", className: "bg-success-subtle text-success" },
  aggregate: { label: "Aggregate", className: "bg-info-subtle text-info" },
  computed: { label: "Computed", className: "bg-secondary text-secondary-foreground" },
  synthetic: { label: "Synthetic / stale", className: "bg-warning-subtle text-warning" },
  stale: { label: "Stale", className: "bg-warning-subtle text-warning" },
}

function StatusBadge({ status }: { status: SectionHealth["status"] }) {
  const s = STATUS_STYLE[status]
  return <Badge className={cn("font-medium", s.className)}>{s.label}</Badge>
}

export function DataHealthPage() {
  const health = useDataHealth()

  return (
    <Page>
      <PageHeader
        title="Data Health"
        description="What's real, what's aggregate, what's synthetic or stale, and what's still missing — per section of the Abstract."
      />

      {health.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(health.error, "Could not load data health.")}
        </Banner>
      )}

      {health.data && (
        <div className="mb-5 grid grid-cols-3 gap-4">
          <Card className="shadow-(--shadow-card)">
            <CardContent className="pt-5">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                PO / Invoice linkage
              </div>
              <div className="tnum mt-1 text-2xl font-semibold">
                {health.data.po_invoice_linkage_pct === null
                  ? "—"
                  : `${health.data.po_invoice_linkage_pct.toFixed(1)}%`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {health.data.grn_linked} of {health.data.grn_total} GRNs linked to a real Purchase Order
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-(--shadow-card)">
            <CardContent className="pt-5">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Open exceptions
              </div>
              <div className="tnum mt-1 text-2xl font-semibold">{health.data.open_exceptions}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {health.data.total_exceptions} total ever raised by the rules engine
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-(--shadow-card)">
            <CardContent className="pt-5">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Ledger activity span
              </div>
              <div className="tnum mt-1 text-2xl font-semibold">
                {health.data.earliest_activity ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                through {health.data.latest_activity ?? "—"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden shadow-(--shadow-card)">
        <CardContent className="space-y-0 divide-y p-0">
          {health.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            (health.data?.sections ?? []).map((s) => (
              <div key={s.code} className="flex items-start gap-4 px-5 py-4">
                <div className="w-10 shrink-0 pt-0.5 font-semibold text-info">{s.code}</div>
                <div className="w-44 shrink-0 pt-0.5 text-sm font-medium">{s.label}</div>
                <div className="w-32 shrink-0">
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex-1 text-[13px] text-muted-foreground">{s.detail}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </Page>
  )
}
