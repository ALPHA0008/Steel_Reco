import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}

/** Squarified-ish treemap: rectangle area ∝ steel received, fill ∝ health.
 * Uses a simple slice-and-dice with alternating orientation, which is stable
 * and readable for a handful of sites. */
export function Treemap({
  sites,
  height = 260,
  onOpen,
}: {
  sites: AnalyticsSite[]
  height?: number
  onOpen?: (s: AnalyticsSite) => void
}) {
  const items = [...sites]
    .filter((s) => s.received_mt > 0)
    .sort((a, b) => b.received_mt - a.received_mt)
  const total = items.reduce((a, s) => a + s.received_mt, 0) || 1

  // simple binary split layout
  type Rect = { x: number; y: number; w: number; h: number }
  const placed: { site: AnalyticsSite; rect: Rect }[] = []
  const layout = (list: AnalyticsSite[], rect: Rect, horizontal: boolean) => {
    if (list.length === 0) return
    if (list.length === 1) {
      placed.push({ site: list[0], rect })
      return
    }
    const sum = list.reduce((a, s) => a + s.received_mt, 0)
    let half = 0
    let i = 0
    while (i < list.length - 1 && half + list[i].received_mt < sum / 2) {
      half += list[i].received_mt
      i++
    }
    const a = list.slice(0, i || 1)
    const b = list.slice(i || 1)
    const aSum = a.reduce((x, s) => x + s.received_mt, 0)
    const frac = aSum / sum
    if (horizontal) {
      const wA = rect.w * frac
      layout(a, { ...rect, w: wA }, !horizontal)
      layout(b, { x: rect.x + wA, y: rect.y, w: rect.w - wA, h: rect.h }, !horizontal)
    } else {
      const hA = rect.h * frac
      layout(a, { ...rect, h: hA }, !horizontal)
      layout(b, { x: rect.x, y: rect.y + hA, w: rect.w, h: rect.h - hA }, !horizontal)
    }
  }
  layout(items, { x: 0, y: 0, w: 100, h: height }, true)

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {placed.map(({ site, rect }) => {
        const color = healthColor(site.health)
        const big = rect.w > 18 && rect.h > 30
        const clipId = `tm-${site.project_id}`
        // truncate name to fit width (~1.9px per char at fontSize 3.6)
        const maxChars = Math.floor((rect.w - 4) / 1.9)
        const nm = site.name.length > maxChars ? site.name.slice(0, Math.max(3, maxChars - 1)) + "…" : site.name
        return (
          <g key={site.project_id} className="cursor-pointer" onClick={() => onOpen?.(site)}>
            <clipPath id={clipId}>
              <rect x={rect.x + 0.4} y={rect.y + 0.4} width={rect.w - 0.8} height={rect.h - 0.8} rx={1.5} />
            </clipPath>
            <rect x={rect.x + 0.4} y={rect.y + 0.4} width={rect.w - 0.8} height={rect.h - 0.8} rx={1.5} fill={color} fillOpacity={0.88} />
            {big && (
              <g clipPath={`url(#${clipId})`}>
                <text x={rect.x + 2.5} y={rect.y + 8} className="fill-white font-semibold" style={{ fontSize: 3.6 }}>
                  {nm}
                </text>
                <text x={rect.x + 2.5} y={rect.y + 13.5} className="fill-white/80" style={{ fontSize: 3 }}>
                  {(site.received_mt / 1000).toFixed(1)}k MT
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Legend row for the treemap health scale. */
export function TreemapLegend() {
  return (
    <div className={cn("mt-2 flex items-center justify-center gap-3 text-[10.5px] text-muted-foreground")}>
      <span>Area = steel received · color = health:</span>
      {[["Critical", "var(--danger)"], ["At risk", "var(--warning)"], ["Stable", "var(--info)"], ["Healthy", "var(--success)"]].map(([l, c]) => (
        <span key={l} className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: c }} /> {l}
        </span>
      ))}
    </div>
  )
}
