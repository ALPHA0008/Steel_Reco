import { ArrowLeftRight, PackageOpen, Recycle, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsTimelineItem } from "@/lib/types"

const KIND_META: Record<AnalyticsTimelineItem["kind"], { icon: typeof PackageOpen; tone: string; verb: string }> = {
  grn: { icon: PackageOpen, tone: "text-info bg-info-subtle", verb: "Steel received" },
  issue: { icon: ArrowLeftRight, tone: "text-brand-text bg-brand-subtle", verb: "Issued to contractor" },
  scrap: { icon: Recycle, tone: "text-warning bg-warning-subtle", verb: "Scrap logged" },
  exception: { icon: TriangleAlert, tone: "text-danger bg-danger-subtle", verb: "Exception raised" },
}

/** Operational timeline: the most recent ledger events across all sites, as
 * chronological timeline cards. Real GRN / issue / scrap / exception rows. */
export function OperationalTimeline({ items }: { items: AnalyticsTimelineItem[] }) {
  if (items.length === 0) {
    return <div className="py-8 text-center text-[13px] text-muted-foreground">No recent activity.</div>
  }
  return (
    <ol className="relative space-y-0.5">
      {items.map((it, i) => {
        const m = KIND_META[it.kind]
        const Icon = m.icon
        return (
          <li key={i} className="flex gap-3">
            {/* rail */}
            <div className="flex flex-col items-center">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", m.tone)}>
                <Icon className="size-3.5" />
              </span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">{m.verb}</span>
                <span className="tnum shrink-0 text-[11px] text-muted-foreground">{it.date ?? ""}</span>
              </div>
              <div className="truncate text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{it.site}</span>
                {it.qty_mt != null && <> · {it.qty_mt.toLocaleString("en-IN")} MT</>}
                {it.note && it.kind === "exception" && <> · {it.note.replace(/_/g, " ")}</>}
                {it.note && it.kind === "scrap" && <> · {it.note}</>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
