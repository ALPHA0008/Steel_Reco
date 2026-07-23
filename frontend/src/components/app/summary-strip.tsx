import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface SummaryStat {
  label: string
  value: ReactNode
  /** optional tone for the value */
  tone?: "default" | "brand" | "success" | "warning" | "danger" | "muted"
  hint?: string
}

const TONE: Record<NonNullable<SummaryStat["tone"]>, string> = {
  default: "text-foreground",
  brand: "text-brand-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
}

/**
 * A compact figures strip that sits above a ledger table so the page answers
 * "how much, how many" before the reader scrolls a single row. Flat, divided
 * cells — no card-in-card — matching the dense-data aesthetic.
 */
export function SummaryStrip({ stats, className }: { stats: SummaryStat[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-none lg:auto-cols-fr lg:grid-flow-col",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{s.label}</div>
          <div className={cn("tnum mt-1 text-[19px] font-semibold leading-tight", TONE[s.tone ?? "default"])}>
            {s.value}
          </div>
          {s.hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</div>}
        </div>
      ))}
    </div>
  )
}
