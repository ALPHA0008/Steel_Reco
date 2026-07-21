import { cn } from "@/lib/utils"

/**
 * Wastage KPI with real benchmark context: current value, a track showing it
 * against target and best-performing site, and the gap. No invented "industry
 * average" -- only figures we can compute (target = contract cap, best site =
 * lowest real wastage). Answers "how far off are we, and what's achievable?"
 */
export function BenchmarkKpi({
  label,
  current,
  target,
  bestPct,
  bestSite,
  savingsInr,
}: {
  label: string
  current: number | null
  target: number
  bestPct: number | null
  bestSite: string | null
  savingsInr?: number
}) {
  const over = current != null && current > target
  const max = Math.max(current ?? 0, target, bestPct ?? 0) * 1.15 || 1
  const gap = current != null ? current - target : null
  const crore = savingsInr ? savingsInr / 1_00_00_000 : null

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
            over ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success",
          )}
        >
          {over ? "over target" : "on target"}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("tnum font-display text-[28px] font-semibold leading-none tracking-tight", over ? "text-danger" : "text-success")}>
          {current == null ? "—" : `${current.toFixed(2)}%`}
        </span>
        {gap != null && (
          <span className={cn("text-[12px] font-semibold", over ? "text-danger" : "text-success")}>
            {gap >= 0 ? "+" : ""}{gap.toFixed(2)}pp vs target
          </span>
        )}
      </div>

      {crore != null && crore > 0 && (
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          ≈ <span className="font-semibold text-foreground">₹{crore.toFixed(2)} Cr</span>/yr recoverable per 1pp
        </div>
      )}

      {/* benchmark track */}
      <div className="mt-3">
        <div className="relative h-2 rounded-full bg-muted">
          {current != null && (
            <div className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-danger" : "bg-success")} style={{ width: `${(current / max) * 100}%` }} />
          )}
          {/* target tick */}
          <div className="absolute inset-y-[-2px] w-0.5 bg-foreground/70" style={{ left: `${(target / max) * 100}%` }} title={`Target ${target}%`} />
          {/* best-site tick */}
          {bestPct != null && (
            <div className="absolute inset-y-[-2px] w-0.5 bg-info" style={{ left: `${(bestPct / max) * 100}%` }} title={`Best: ${bestSite} ${bestPct}%`} />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-0.5 bg-foreground/70" /> Target {target.toFixed(1)}%</span>
          {bestPct != null && <span className="flex items-center gap-1"><span className="inline-block h-2 w-0.5 bg-info" /> Best {bestSite} {bestPct.toFixed(2)}%</span>}
        </div>
      </div>
    </div>
  )
}
