import { ArrowRight, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The Abstract's story at a glance. The 14-row matrix is the source of truth,
 * but the outcome a QS actually needs — did steel reconcile, and is wastage
 * under cap? — is buried in cells C, G, L, M. This strip surfaces it: the
 * material flow (Net received → Consumed+WIP → Wastage) as connected figures,
 * ending in the wastage-vs-cap verdict. Reads in one glance, then the matrix
 * backs it up.
 */
export function ReconciliationFlow({
  netReceivedKg,
  consumedWipKg,
  physicalKg,
  wastageKg,
  wastagePct,
  capPct,
  scrapKg,
  unit,
  fmt,
}: {
  netReceivedKg: number
  consumedWipKg: number
  physicalKg: number
  wastageKg: number
  wastagePct: number | null
  capPct: number
  scrapKg: number
  unit: "kg" | "mt"
  fmt: (kg: number | undefined, unit: "kg" | "mt") => string
}) {
  const over = wastagePct != null && wastagePct > capPct
  const u = unit.toUpperCase()

  const steps = [
    { label: "Net received", sub: "C", value: netReceivedKg },
    { label: "Consumed + WIP", sub: "G", value: consumedWipKg },
    { label: "Physical stock", sub: "K", value: physicalKg },
  ]

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
      {/* Flow of the three anchor quantities */}
      <div className="flex flex-wrap items-stretch gap-2 rounded-2xl border bg-card p-4 shadow-(--shadow-card)">
        {steps.map((s, i) => (
          <div key={s.sub} className="flex flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                {s.label}
                <span className="text-[10px] text-muted-foreground/60">{s.sub}</span>
              </div>
              <div className="tnum mt-0.5 text-[20px] font-semibold leading-tight">
                {fmt(s.value, unit)}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">{u}</span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {/* Wastage verdict — the number everything else leads to */}
      <div
        className={cn(
          "flex min-w-[220px] flex-col justify-center rounded-2xl border p-4 shadow-(--shadow-card)",
          over ? "border-danger-border bg-danger-subtle" : "border-success-border bg-success-subtle",
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          <TrendingDown className="size-3.5" aria-hidden />
          Wastage vs {capPct.toFixed(0)}% cap
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={cn("tnum text-[28px] font-bold leading-none", over ? "text-danger" : "text-success")}>
            {wastagePct == null ? "—" : `${wastagePct.toFixed(2)}%`}
          </span>
          {wastagePct != null && (
            <span className={cn("text-[12px] font-semibold", over ? "text-danger" : "text-success")}>
              {over ? "▲" : "▼"} {Math.abs(wastagePct - capPct).toFixed(2)}pp {over ? "over" : "under"}
            </span>
          )}
        </div>
        <div className="tnum mt-1.5 text-[11.5px] text-muted-foreground">
          {fmt(wastageKg, unit)} {u} wasted · {fmt(scrapKg, unit)} {u} scrap sold
        </div>
      </div>
    </div>
  )
}
