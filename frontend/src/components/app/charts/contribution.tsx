import { useState } from "react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}

/**
 * Portfolio contribution chart — a ranked, part-to-whole view of steel volume
 * across sites (replaces the hard-to-read treemap). Each bar's width is the
 * site's share of total received; color encodes health. Far more legible than
 * a treemap for a handful of sites, and every row is click-to-filter with a
 * rich hover readout. This is the #5 "stacked contribution" option.
 */
export function ContributionChart({
  sites,
  activeId,
  onOpen,
}: {
  sites: AnalyticsSite[]
  activeId?: string | null
  onOpen?: (s: AnalyticsSite) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const rows = [...sites].filter((s) => s.received_mt > 0).sort((a, b) => b.received_mt - a.received_mt)
  const total = rows.reduce((a, s) => a + s.received_mt, 0) || 1

  return (
    <div className="relative">
      {/* single composite bar = whole portfolio, segmented by site */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
        {rows.map((s) => (
          <div
            key={s.project_id}
            className="h-full cursor-pointer transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.received_mt / total) * 100}%`,
              background: healthColor(s.health),
              opacity: activeId && activeId !== s.project_id ? 0.25 : hover === s.project_id ? 1 : 0.82,
              boxShadow: "inset -1px 0 0 var(--card)",
            }}
            onMouseEnter={() => setHover(s.project_id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onOpen?.(s)}
            title={s.name}
          />
        ))}
      </div>

      {/* ranked rows */}
      <div className="space-y-1">
        {rows.map((s) => {
          const share = (s.received_mt / total) * 100
          const active = activeId === s.project_id
          return (
            <button
              key={s.project_id}
              type="button"
              onMouseEnter={() => setHover(s.project_id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpen?.(s)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors",
                active ? "bg-brand-subtle" : "hover:bg-row-hover",
              )}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: healthColor(s.health) }} />
              <span className="w-28 shrink-0 truncate text-[12.5px] font-medium">{s.name}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share}%`, background: healthColor(s.health) }} />
              </span>
              <span className="tnum w-12 shrink-0 text-right text-[12px] font-semibold">{share.toFixed(0)}%</span>
              <span className="tnum w-20 shrink-0 text-right text-[11.5px] text-muted-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
            </button>
          )
        })}
      </div>

      {hover && (() => {
        const s = rows.find((r) => r.project_id === hover)
        if (!s) return null
        return (
          <div className="pointer-events-none absolute right-2 top-0 z-10 rounded-lg border bg-background px-3 py-2 text-[11px] shadow-lg">
            <div className="mb-1 font-semibold">{s.name}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
              <span>Received</span><span className="tnum text-right text-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
              <span>Scrap</span><span className="tnum text-right text-foreground">{s.scrap_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
              <span>Wastage</span><span className="tnum text-right text-foreground">{s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}</span>
              <span>Health</span><span className="tnum text-right text-foreground">{s.health}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
