import { useMemo, useState } from "react"
import type { AnalyticsSite } from "@/lib/types"

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`
}
function monthShort(y: number, m: number): string {
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" })
}

/** Wastage intensity for a cell -> sequential red ramp (one hue, light→dark),
 * bucketed against the cap. Under cap stays light; well over cap goes deep. */
function cellColor(pct: number | null, cap: number): string {
  if (pct == null) return "var(--muted)"
  const ratio = pct / cap // 1.0 = at cap
  if (ratio <= 0.5) return "color-mix(in srgb, var(--danger) 12%, var(--card))"
  if (ratio <= 0.85) return "color-mix(in srgb, var(--danger) 26%, var(--card))"
  if (ratio <= 1.0) return "color-mix(in srgb, var(--danger) 42%, var(--card))"
  if (ratio <= 1.3) return "color-mix(in srgb, var(--danger) 62%, var(--card))"
  if (ratio <= 1.6) return "color-mix(in srgb, var(--danger) 80%, var(--card))"
  return "var(--danger)"
}

/**
 * Risk heatmap: rows = sites, columns = months, cell intensity = wastage
 * against cap. The single most information-dense view of where and when
 * wastage ran hot. Only the most recent N months to stay legible.
 */
export function RiskHeatmap({
  sites,
  months = 15,
  onOpen,
}: {
  sites: AnalyticsSite[]
  months?: number
  onOpen?: (s: AnalyticsSite) => void
}) {
  const [hover, setHover] = useState<{ site: string; label: string; pct: number | null } | null>(null)

  // union of the most recent `months` month-keys across all sites
  const monthCols = useMemo(() => {
    const set = new Set<string>()
    for (const s of sites) for (const p of s.trend) set.add(monthKey(p.year, p.month))
    return Array.from(set).sort().slice(-months)
  }, [sites, months])

  const bySiteMonth = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>()
    for (const s of sites) {
      const inner = new Map<string, number | null>()
      for (const p of s.trend) inner.set(monthKey(p.year, p.month), p.wastage_pct)
      m.set(s.project_id, inner)
    }
    return m
  }, [sites])

  // only sites that actually have monthly series
  const rows = sites.filter((s) => s.trend.some((p) => p.wastage_pct != null))

  return (
    <div className="relative overflow-x-auto">
      <div className="min-w-[560px]">
        {/* header months */}
        <div className="flex pl-[104px]">
          {monthCols.map((mk, i) => {
            const [y, m] = mk.split("-").map(Number)
            return (
              <div key={mk} className="flex-1 text-center text-[9px] text-muted-foreground">
                {i % 2 === 0 ? monthShort(y, m) : ""}
              </div>
            )
          })}
        </div>
        {rows.map((s) => {
          const inner = bySiteMonth.get(s.project_id)
          return (
            <div key={s.project_id} className="flex items-center gap-0.5 py-0.5">
              <button
                type="button"
                onClick={() => onOpen?.(s)}
                className="w-[100px] shrink-0 truncate pr-1 text-right text-[11px] font-medium hover:text-brand-text"
              >
                {s.name}
              </button>
              <div className="flex flex-1 gap-0.5">
                {monthCols.map((mk) => {
                  const pct = inner?.get(mk) ?? null
                  const [y, m] = mk.split("-").map(Number)
                  return (
                    <div
                      key={mk}
                      className="h-5 flex-1 rounded-[3px] transition-transform hover:scale-110"
                      style={{ background: cellColor(pct, s.cap_pct) }}
                      onMouseEnter={() => setHover({ site: s.name, label: `${monthShort(y, m)} ${String(y).slice(2)}`, pct })}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {hover && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border bg-background px-2.5 py-1.5 text-[11px] shadow-lg">
          <span className="font-semibold">{hover.site}</span> · {hover.label} ·{" "}
          <span className="tnum">{hover.pct == null ? "no data" : `${hover.pct.toFixed(2)}%`}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>under cap</span>
        {[12, 26, 42, 62, 80, 100].map((o) => (
          <span key={o} className="size-3 rounded-[2px]" style={{ background: o === 100 ? "var(--danger)" : `color-mix(in srgb, var(--danger) ${o}%, var(--card))` }} />
        ))}
        <span>well over</span>
      </div>
    </div>
  )
}
