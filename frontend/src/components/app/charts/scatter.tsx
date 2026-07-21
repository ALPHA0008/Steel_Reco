import { useState } from "react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

const RISK_COLOR: Record<AnalyticsSite["risk"], string> = {
  low: "var(--success)",
  medium: "var(--info)",
  high: "var(--warning)",
  critical: "var(--danger)",
}

/**
 * Scatter: X = steel received (MT), Y = wastage %, bubble size = open
 * exceptions, color = risk. One glance shows whether high-volume sites are the
 * ones bleeding wastage, and the cap line marks the compliance threshold.
 */
export function ScatterChart({
  sites,
  capPct = 3,
  height = 300,
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
  const maxX = Math.max(1, ...pts.map((s) => s.received_mt))
  const maxY = Math.max(capPct + 1, ...pts.map((s) => s.wastage_pct ?? 0)) * 1.1
  const maxExc = Math.max(1, ...pts.map((s) => s.open_exceptions))

  const padL = 42
  const padB = 28
  const padT = 10
  const padR = 12
  const W = 520
  const plotW = W - padL - padR
  const plotH = height - padT - padB

  const x = (v: number) => padL + (v / maxX) * plotW
  const y = (v: number) => padT + plotH - (v / maxY) * plotH
  const r = (exc: number) => 5 + (exc / maxExc) * 16

  const yTicks = [0, capPct, Math.round(maxY)]
  const xTicks = [0, Math.round(maxX / 2), Math.round(maxX)]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ maxHeight: height }}>
        {/* decision-matrix quadrants: divide at cap (y) and mid-volume (x).
            Top-right (high volume, over cap) = the worst / priority quadrant. */}
        {(() => {
          const xMid = x(maxX / 2)
          const yCap = y(capPct)
          return (
            <g>
              {/* priority quadrant (high volume, over cap) tinted danger */}
              <rect x={xMid} y={padT} width={W - padR - xMid} height={yCap - padT} fill="var(--danger)" opacity={0.05} />
              {/* healthy quadrant (any volume, under cap) tinted success faintly */}
              <rect x={padL} y={yCap} width={W - padR - padL} height={padT + plotH - yCap} fill="var(--success)" opacity={0.04} />
              <line x1={xMid} y1={padT} x2={xMid} y2={padT + plotH} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3" />
              <text x={W - padR - 4} y={padT + 11} textAnchor="end" className="fill-danger/70 text-[8.5px] font-semibold">PRIORITY · high volume, over cap</text>
              <text x={padL + 4} y={padT + plotH - 5} className="fill-success/70 text-[8.5px] font-semibold">HEALTHY · under cap</text>
            </g>
          )
        })()}
        {/* grid + y ticks */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="var(--border)" strokeWidth={t === capPct ? 0 : 1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{t}%</text>
          </g>
        ))}
        {/* cap line */}
        <line x1={padL} y1={y(capPct)} x2={W - padR} y2={y(capPct)} stroke="var(--danger)" strokeWidth={1.2} strokeDasharray="4 3" />
        <text x={W - padR} y={y(capPct) - 4} textAnchor="end" className="fill-danger text-[9px] font-semibold">{capPct}% cap</text>
        {/* x ticks */}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={height - 10} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {t.toLocaleString("en-IN")}
          </text>
        ))}
        <text x={padL + plotW / 2} y={height - 0.5} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          Steel received (MT)
        </text>
        {/* bubbles */}
        {pts.map((s) => (
          <g
            key={s.project_id}
            className="cursor-pointer"
            onMouseEnter={() => setHover(s.project_id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onOpen?.(s)}
          >
            {activeId === s.project_id && (
              <circle cx={x(s.received_mt)} cy={y(s.wastage_pct ?? 0)} r={r(s.open_exceptions) + 4} fill="none" stroke={RISK_COLOR[s.risk]} strokeWidth={1} opacity={0.4} />
            )}
            <circle
              cx={x(s.received_mt)}
              cy={y(s.wastage_pct ?? 0)}
              r={r(s.open_exceptions)}
              fill={RISK_COLOR[s.risk]}
              fillOpacity={activeId && activeId !== s.project_id ? 0.1 : hover === s.project_id || activeId === s.project_id ? 0.6 : 0.32}
              stroke={RISK_COLOR[s.risk]}
              strokeWidth={activeId === s.project_id ? 2.5 : 1.5}
              strokeOpacity={activeId && activeId !== s.project_id ? 0.3 : 1}
            />
            {hover === s.project_id && (
              <text x={x(s.received_mt)} y={y(s.wastage_pct ?? 0) - r(s.open_exceptions) - 4} textAnchor="middle" className="fill-foreground text-[9px] font-semibold">
                {s.name}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover && (() => {
        const s = pts.find((p) => p.project_id === hover)!
        return (
          <div className="pointer-events-none absolute right-2 top-2 rounded-lg border bg-background px-2.5 py-1.5 text-[11px] shadow-lg">
            <div className="font-semibold">{s.name}</div>
            <div className="text-muted-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT · {s.wastage_pct?.toFixed(2)}% · {s.open_exceptions} flags</div>
          </div>
        )
      })()}
      {/* legend */}
      <div className="mt-1 flex items-center justify-center gap-3 text-[10.5px] text-muted-foreground">
        {(["critical", "high", "medium", "low"] as const).map((r) => (
          <span key={r} className="flex items-center gap-1 capitalize">
            <span className="size-2 rounded-full" style={{ background: RISK_COLOR[r] }} /> {r}
          </span>
        ))}
        <span className="ml-2">bubble = open exceptions</span>
      </div>
    </div>
  )
}
