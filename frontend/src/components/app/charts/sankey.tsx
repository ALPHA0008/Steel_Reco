import { cn } from "@/lib/utils"

/**
 * Material-flow Sankey (linear chain): Received → Issued → Consumed → Scrap,
 * with the un-issued/remaining balance branching off. Ribbon widths are
 * proportional to MT. Deliberately a simple left→right flow (not a general
 * graph) — that's exactly what the reconciliation story is.
 */
export function SankeyFlow({
  received,
  issued,
  consumed,
  scrap,
  balance,
  height = 260,
}: {
  received: number
  issued: number
  consumed: number
  scrap: number
  balance: number
  height?: number
}) {
  const max = Math.max(received, 1)
  const h = (v: number) => Math.max(3, (v / max) * (height - 40))

  // node columns
  const stages: { label: string; value: number; color: string }[] = [
    { label: "Received", value: received, color: "var(--info)" },
    { label: "Issued", value: issued, color: "var(--brand)" },
    { label: "Consumed", value: consumed, color: "var(--warning)" },
    { label: "Scrap", value: scrap, color: "var(--danger)" },
  ]

  const colW = 100 / stages.length
  const nodeW = 3

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        {/* ribbons between consecutive stages */}
        {stages.slice(0, -1).map((s, i) => {
          const next = stages[i + 1]
          const x1 = i * colW + colW / 2 + nodeW / 2
          const x2 = (i + 1) * colW + colW / 2 - nodeW / 2
          const h1 = h(s.value)
          const h2 = h(next.value)
          const y1 = (height - 20 - h1) / 2
          const y2 = (height - 20 - h2) / 2
          const mx = (x1 + x2) / 2
          const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${mx},${y2 + h2} ${mx},${y1 + h1} ${x1},${y1 + h1} Z`
          return <path key={i} d={d} fill={next.color} opacity={0.16} />
        })}
        {/* nodes */}
        {stages.map((s, i) => {
          const x = i * colW + colW / 2 - nodeW / 2
          const hh = h(s.value)
          const y = (height - 20 - hh) / 2
          return <rect key={s.label} x={x} y={y} width={nodeW} height={hh} rx={1} fill={s.color} />
        })}
      </svg>
      <div className="mt-2 flex">
        {stages.map((s) => (
          <div key={s.label} className="flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
            <div className="tnum text-[12.5px] font-semibold">{s.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
          </div>
        ))}
      </div>
      <div className={cn("mt-2 rounded-lg bg-muted/60 px-3 py-2 text-center text-[12px]")}>
        Remaining balance on hand:{" "}
        <span className="tnum font-semibold text-foreground">{balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
      </div>
    </div>
  )
}
