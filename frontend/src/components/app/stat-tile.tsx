import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/app/sparkline"

type Tone = "neutral" | "success" | "warning" | "danger" | "info"

const VALUE_TONE: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
}

/** Count up a numeric value on mount (executive polish). Falls back to the
 * formatted string for non-numeric values. */
function useCountUp(target: number, enabled: boolean) {
  const [v, setV] = useState(enabled ? 0 : target)
  const ref = useRef(target)
  ref.current = target
  useEffect(() => {
    if (!enabled) {
      setV(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const dur = 800
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setV(ref.current * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled])
  return v
}

/**
 * Executive KPI tile: large metric (optional count-up), a period-over-period
 * trend delta, an optional sparkline, an optional target-progress bar, and a
 * contextual status chip. Everything is optional so the same tile serves a
 * bare number or a fully-loaded metric.
 */
export function StatTile({
  label,
  value,
  numericValue,
  unit,
  tone = "neutral",
  delta,
  deltaLabel,
  spark,
  sparkTone,
  progress,
  progressLabel,
  chip,
  icon,
  countUp = true,
  format = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 }),
}: {
  label: string
  value?: string
  /** if provided, the tile count-ups to this and formats it */
  numericValue?: number
  unit?: string
  tone?: Tone
  /** signed % change; positive shows up-arrow */
  delta?: number | null
  deltaLabel?: string
  spark?: number[]
  sparkTone?: Tone
  /** 0..1 progress toward a target */
  progress?: number
  progressLabel?: ReactNode
  chip?: ReactNode
  icon?: ReactNode
  countUp?: boolean
  format?: (n: number) => string
}) {
  const counted = useCountUp(numericValue ?? 0, countUp && numericValue !== undefined)
  const display = numericValue !== undefined ? format(counted) : (value ?? "—")

  const deltaUp = (delta ?? 0) > 0
  const deltaColor =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : deltaUp
        ? "text-danger" // for wastage/exceptions, up is bad; caller can override via tone if needed
        : "text-success"

  return (
    <div className="group flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-(--shadow-card) transition-shadow hover:shadow-[0_4px_24px_rgba(20,20,22,0.08)]">
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className={cn("tnum font-display text-[28px] font-semibold leading-none tracking-tight", VALUE_TONE[tone])}>
            {display}
            {unit && <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">{unit}</span>}
          </div>
          {(delta != null || deltaLabel) && (
            <div className={cn("mt-2 flex items-center gap-1 text-[12px] font-medium", deltaColor)}>
              {delta != null &&
                (deltaUp ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)}
              {delta != null && <span className="tnum">{Math.abs(delta).toFixed(1)}%</span>}
              {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
            </div>
          )}
        </div>
        {spark && spark.length >= 2 && (
          <span className={cn(sparkTone ? VALUE_TONE[sparkTone] : "text-muted-foreground")}>
            <Sparkline data={spark} width={96} height={34} />
          </span>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-brand",
              )}
              style={{ width: `${Math.max(2, Math.min(100, progress * 100))}%` }}
            />
          </div>
          {progressLabel && <div className="mt-1 text-[11px] text-muted-foreground">{progressLabel}</div>}
        </div>
      )}

      {chip && <div className="mt-3">{chip}</div>}
    </div>
  )
}
