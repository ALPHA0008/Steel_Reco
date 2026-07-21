import { cn } from "@/lib/utils"

interface Step {
  label: string
  value: number // signed; totals use their own value, deltas add/subtract
  kind: "total" | "increase" | "decrease"
}

/** Waterfall: running-balance bars showing how a starting total is drawn down
 * (or built up) step by step. Totals sit on the baseline; deltas float at the
 * running level. Pure SVG, no chart lib. */
export function WaterfallChart({ steps, height = 240 }: { steps: Step[]; height?: number }) {
  // Compute running levels
  let running = 0
  const bars = steps.map((s) => {
    if (s.kind === "total") {
      const bar = { ...s, from: 0, to: s.value }
      running = s.value
      return bar
    }
    const from = running
    running += s.value
    return { ...s, from, to: running }
  })

  const maxVal = Math.max(...bars.flatMap((b) => [b.from, b.to, 0]))
  const minVal = Math.min(...bars.flatMap((b) => [b.from, b.to, 0]))
  const span = maxVal - minVal || 1
  const plotH = height - 40 // room for labels
  const y = (v: number) => plotH - ((v - minVal) / span) * plotH
  const barW = 100 / bars.length

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {bars.map((b, i) => {
        const top = Math.min(y(b.from), y(b.to))
        const h = Math.max(2, Math.abs(y(b.from) - y(b.to)))
        const x = i * barW + barW * 0.18
        const w = barW * 0.64
        const color = b.kind === "total" ? "var(--brand)" : b.kind === "decrease" ? "var(--danger)" : "var(--success)"
        return (
          <g key={b.label}>
            {/* connector to next */}
            {i < bars.length - 1 && (
              <line
                x1={x + w}
                y1={y(b.to)}
                x2={(i + 1) * barW + barW * 0.18}
                y2={y(b.to)}
                stroke="var(--border)"
                strokeWidth={0.4}
                strokeDasharray="1 1"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <rect x={x} y={top} width={w} height={h} rx={1.2} fill={color} opacity={0.9} />
          </g>
        )
      })}
    </svg>
  )
}

/** Companion label row (rendered separately so text isn't distorted by the
 * non-uniform SVG scale). */
export function WaterfallLabels({ steps }: { steps: Step[] }) {
  let running = 0
  return (
    <div className="mt-2 flex">
      {steps.map((s) => {
        let shown: number
        if (s.kind === "total") {
          shown = s.value
          running = s.value
        } else {
          running += s.value
          shown = s.value
        }
        return (
          <div key={s.label} className="flex-1 text-center">
            <div className="text-[10.5px] text-muted-foreground">{s.label}</div>
            <div className={cn("tnum text-[12px] font-semibold", s.kind === "decrease" ? "text-danger" : s.kind === "increase" ? "text-success" : "text-foreground")}>
              {s.kind === "decrease" ? "−" : ""}
              {Math.abs(shown).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
