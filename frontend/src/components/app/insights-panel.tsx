import { ArrowUpRight, Lightbulb, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsAction, AnalyticsInsight } from "@/lib/types"

const SEVERITY: Record<AnalyticsInsight["severity"], { dot: string; text: string }> = {
  info: { dot: "bg-info", text: "text-info" },
  warning: { dot: "bg-warning", text: "text-warning" },
  critical: { dot: "bg-danger", text: "text-danger" },
}

const PRIORITY: Record<AnalyticsAction["priority"], string> = {
  high: "bg-danger-subtle text-danger",
  medium: "bg-warning-subtle text-warning",
  low: "bg-muted text-muted-foreground",
}

/** Bare insight list -- no card chrome, for embedding in another container. */
export function InsightList({ insights, onOpenSite }: { insights: AnalyticsInsight[]; onOpenSite?: (projectId: string) => void }) {
  return (
    <ul className="space-y-1">
      {insights.length === 0 && (
        <li className="py-6 text-center text-[13px] text-muted-foreground">Nothing needs attention right now.</li>
      )}
      {insights.map((ins, i) => {
        const clickable = Boolean(ins.project_id && onOpenSite)
        return (
          <li key={i}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => ins.project_id && onOpenSite?.(ins.project_id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                clickable && "cursor-pointer hover:bg-row-hover",
              )}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY[ins.severity].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-foreground">{ins.title}</span>
                <span className="block text-[12.5px] leading-snug text-muted-foreground">{ins.detail}</span>
              </span>
              {clickable && <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Bare action list -- no card chrome, for embedding in another container. */
export function ActionList({ actions, onOpenSite }: { actions: AnalyticsAction[]; onOpenSite?: (projectId: string) => void }) {
  return (
    <ul className="space-y-2">
      {actions.length === 0 && (
        <li className="py-6 text-center text-[13px] text-muted-foreground">No actions recommended.</li>
      )}
      {actions.map((a, i) => (
        <li key={i}>
          <button
            type="button"
            disabled={!(a.project_id && onOpenSite)}
            onClick={() => a.project_id && onOpenSite?.(a.project_id)}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-xl border border-border/60 px-3 py-2.5 text-left transition-colors",
              a.project_id && onOpenSite && "cursor-pointer hover:border-brand-border hover:bg-row-hover",
            )}
          >
            <span className={cn("mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", PRIORITY[a.priority])}>
              {a.priority}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">{a.title}</span>
              <span className="block text-[12px] leading-snug text-muted-foreground">{a.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Operational Insights + Recommended Actions. Surfaces what management should
 * notice and do, so they never have to read a chart to find the story. Every
 * line is computed from real figures on the backend; clicking one drills into
 * the site it references.
 */
export function InsightsPanel({
  insights,
  actions,
  onOpenSite,
}: {
  insights: AnalyticsInsight[]
  actions: AnalyticsAction[]
  onOpenSite?: (projectId: string) => void
}) {
  return (
    <div className="grid grid-cols-[1.35fr_1fr] gap-4">
      <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-card)">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-subtle text-brand-text">
            <Sparkles className="size-4" />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight">Operational insights</h2>
        </div>
        <InsightList insights={insights} onOpenSite={onOpenSite} />
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-card)">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Lightbulb className="size-4" />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight">Recommended actions</h2>
        </div>
        <ActionList actions={actions} onOpenSite={onOpenSite} />
      </div>
    </div>
  )
}
