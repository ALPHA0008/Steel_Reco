import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

type Tone = "neutral" | "success" | "warning" | "danger" | "info"

const CHIP: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
}

/** KPI stat tile: label + icon, big tabular value, one status chip (design.md §9.2). */
export function KpiCard({
  label,
  value,
  unit,
  icon,
  chip,
  chipTone = "neutral",
  tone,
  children,
}: {
  label: string
  value: string
  unit?: string
  icon?: ReactNode
  chip?: ReactNode
  chipTone?: Tone
  /** colors the value itself (e.g. danger for over-cap wastage) */
  tone?: Tone
  /** optional footer content, e.g. a sparkline — earn it, don't default it */
  children?: ReactNode
}) {
  return (
    <Card className="gap-0 p-5 shadow-(--shadow-card)">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          "tnum font-display mt-3 text-[28px] font-semibold leading-none tracking-tight",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">{unit}</span>}
      </div>
      {chip && (
        <span
          className={cn(
            "mt-2.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            CHIP[chipTone],
          )}
        >
          {chip}
        </span>
      )}
      {children}
    </Card>
  )
}
