import { useState } from "react"
import type { AnalyticsSite } from "@/lib/types"

const RISK_COLOR: Record<AnalyticsSite["risk"], string> = {
  low: "var(--success)",
  medium: "var(--info)",
  high: "var(--warning)",
  critical: "var(--danger)",
}

/**
 * Decision matrix — X = steel received (MT), Y = wastage %, bubble size = open
 * exceptions, color = risk. Quadrants (split at mid-volume × cap) name the
 * story: top-right = high volume & over cap = priority. Generous padding,
 * gridlines, axis titles, always-on labels and a hover card — built to read
 * as a premium analytics chart, not a cramped dot plot.
 */
export function ScatterChart({
  sites,
  capPct = 3,
  height = 340,
  onOpen,
  activeId,
}: {
  sites: AnalyticsSite[]
  capPct?: number
  height?: number
  onOpen?: (s: AnalyticsSite) => void
  activeId?: string | null
}) {
  const [hover, setHover] = useState<string | null>(null)
  const pts = sites.filter((s) => s.wastage_pct != null)
  const maxX = Math.max(1, ...pts.map((s) => s.received_mt)) * 1.08
  const maxY = Math.max(capPct + 1.5, ...pts.map((s) => s.wastage_pct ?? 0)) * 1.12
  const maxExc = Math.max(1, ...pts.map((s) => s.open_exceptions))

  const padL = 52
  const padB = 44
  const padT = 16
  const padR = 20
  const W = 560
  const plotW = W - padL - padR
  const plotH = height - padT - padB

  const x = (v: number) => padL + (v / maxX) * plotW
  const y = (v: number) => padT + plotH - (v / maxY) * plotH
  const r = (exc: number) => 9 + (exc / maxExc) * 20

  // Label placement, resolved before drawing.
  //
  // Every label used to sit directly above its own bubble, which fails as soon
  // as two sites land in the same place: Nishada (51.2k MT, 5.74%) and Sayuk
  // (54.4k, 5.79%) printed their names on top of one another and neither could
  // be read. Each label now takes the first free slot -- above the bubble, else
  // below it -- and any that still collides is dropped rather than overprinted.
  // Dropping is safe because the hover card names every point, and a chart with
  // most points labelled beats one where two are illegible.
  const labelY = new Map<string, number>()
  {
    const taken: Array<{ x1: number; x2: number; y1: number; y2: number }> = []
    // Biggest bubbles first: they are the ones a reader looks at, so they get
    // first claim on the space.
    for (const s of [...pts].sort((a, b) => b.open_exceptions - a.open_exceptions)) {
      const cx = x(s.received_mt)
      const cy = y(s.wastage_pct ?? 0)
      const rad = r(s.open_exceptions)
      const halfW = Math.max(16, s.name.length * 2.7)
      for (const dy of [-(rad + 5), rad + 13]) {
        const box = { x1: cx - halfW, x2: cx + halfW, y1: cy + dy - 9, y2: cy + dy + 3 }
        const clash = taken.some(
          (t) => box.x1 < t.x2 && box.x2 > t.x1 && box.y1 < t.y2 && box.y2 > t.y1,
        )
        if (!clash) {
          taken.push(box)
          labelY.set(s.project_id, cy + dy)
          break
        }
      }
    }
  }

  const yTicks = [...new Set([0, capPct, Math.round(maxY / 2), Math.round(maxY)])]
  const xMid = maxX / 2
  const xTicks = [...new Set([0, Math.round(xMid), Math.round(maxX)])]
  const active = hover ?? activeId ?? null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ maxHeight: height + 20 }}>
        {/* quadrant tints: priority (high vol + over cap) and healthy (under cap) */}
        <rect x={x(xMid)} y={padT} width={x(maxX) - x(xMid)} height={y(capPct) - padT} fill="var(--danger)" opacity={0.05} />
        <rect x={padL} y={y(capPct)} width={plotW} height={padT + plotH - y(capPct)} fill="var(--success)" opacity={0.045} />
        <text x={x(maxX) - 4} y={padT + 12} textAnchor="end" className="fill-danger/70 text-[9px] font-semibold">PRIORITY · high volume, over cap</text>
        <text x={padL + 4} y={padT + plotH - 6} className="fill-success/70 text-[9px] font-semibold">HEALTHY · under cap</text>

        {/* horizontal gridlines + y ticks */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="var(--border)" strokeWidth={t === capPct ? 0 : 1} opacity={0.5} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}%</text>
          </g>
        ))}
        {/* vertical mid divider */}
        <line x1={x(xMid)} y1={padT} x2={x(xMid)} y2={padT + plotH} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
        {/* cap line */}
        <line x1={padL} y1={y(capPct)} x2={W - padR} y2={y(capPct)} stroke="var(--danger)" strokeWidth={1.3} strokeDasharray="5 3" />
        <text x={W - padR} y={y(capPct) - 5} textAnchor="end" className="fill-danger text-[10px] font-semibold">{capPct}% cap</text>

        {/* x ticks + title */}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={height - padB + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}
          </text>
        ))}
        <text x={padL + plotW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">
          Steel received (MT) →
        </text>
        {/* y axis title */}
        <text x={14} y={padT + plotH / 2} textAnchor="middle" transform={`rotate(-90, 14, ${padT + plotH / 2})`} className="fill-muted-foreground text-[10px] font-medium">
          Wastage % →
        </text>

        {/* bubbles */}
        {pts.map((s) => {
          const cx = x(s.received_mt)
          const cy = y(s.wastage_pct ?? 0)
          const rad = r(s.open_exceptions)
          const color = RISK_COLOR[s.risk]
          const isActive = active === s.project_id
          const dim = active != null && active !== s.project_id
          return (
            <g
              key={s.project_id}
              className="cursor-pointer"
              onMouseEnter={() => setHover(s.project_id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpen?.(s)}
              style={{ transition: "opacity 0.2s" }}
              opacity={dim ? 0.35 : 1}
            >
              {isActive && (
                <circle cx={cx} cy={cy} r={rad + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5}>
                  <animate attributeName="r" values={`${rad + 4};${rad + 8};${rad + 4}`} dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity={isActive ? 0.55 : 0.3} stroke={color} strokeWidth={isActive ? 2.5 : 1.75} />
              {labelY.has(s.project_id) && (
                <text
                  x={cx}
                  y={labelY.get(s.project_id)}
                  textAnchor="middle"
                  className="fill-foreground text-[9.5px] font-semibold"
                  opacity={dim ? 0 : 0.9}
                >
                  {s.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && (() => {
        const s = pts.find((p) => p.project_id === hover)!
        return (
          <div className="pointer-events-none absolute right-3 top-3 rounded-xl border bg-background px-3 py-2 text-[11px] shadow-xl">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <span className="size-2 rounded-full" style={{ background: RISK_COLOR[s.risk] }} />
              {s.name}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
              <span>Received</span><span className="tnum text-right text-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
              <span>Wastage</span><span className="tnum text-right text-foreground">{s.wastage_pct?.toFixed(2)}%</span>
              <span>Exceptions</span><span className="tnum text-right text-foreground">{s.open_exceptions.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )
      })()}

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
        {(["critical", "high", "medium", "low"] as const).map((rk) => (
          <span key={rk} className="flex items-center gap-1 capitalize">
            <span className="size-2 rounded-full" style={{ background: RISK_COLOR[rk] }} /> {rk}
          </span>
        ))}
        <span className="ml-1 flex items-center gap-1">
          <span className="size-2 rounded-full border border-muted-foreground/40" />
          <span className="size-3 rounded-full border border-muted-foreground/40" />
          bubble = open exceptions
        </span>
      </div>
    </div>
  )
}
