import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/** Health band -> semantic color. Green healthy, amber warning, red critical --
 * saturated color reserved for the ends, per the color strategy. */
function bandColor(score: number): string {
  if (score >= 75) return "var(--success)"
  if (score >= 55) return "var(--info)"
  if (score >= 35) return "var(--warning)"
  return "var(--danger)"
}
function bandLabel(score: number): string {
  if (score >= 75) return "Healthy"
  if (score >= 55) return "Stable"
  if (score >= 35) return "At risk"
  return "Critical"
}

/**
 * Portfolio Health Score — the executive centerpiece. A radial gauge (0–100)
 * with a count-up animation and band-colored arc. Reads in <1s: the number,
 * the label, the color all say the same thing.
 */
export function HealthGauge({
  score,
  size = 180,
  label = "Portfolio Health",
  animate = true,
}: {
  score: number
  size?: number
  label?: string
  animate?: boolean
}) {
  const [shown, setShown] = useState(animate ? 0 : score)

  useEffect(() => {
    if (!animate) {
      setShown(score)
      return
    }
    let raf = 0
    const start = performance.now()
    const dur = 900
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setShown(Math.round(from + (score - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score, animate])

  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, shown)) / 100
  const color = bandColor(score)

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: animate ? "stroke-dashoffset 0.1s linear" : undefined }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-display text-[44px] font-semibold leading-none tracking-tight" style={{ color }}>
            {shown}
          </span>
          <span className="mt-0.5 text-[12px] font-medium text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="mt-3 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
        <div
          className={cn("mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold")}
          style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {bandLabel(score)}
        </div>
      </div>
    </div>
  )
}
