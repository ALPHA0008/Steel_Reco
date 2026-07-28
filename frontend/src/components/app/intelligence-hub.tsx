import { useState } from "react"
import { AlertOctagon, Lightbulb, ListTree, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { deriveAlerts, AlertList } from "@/components/app/alerts-center"
import { InsightList, ActionList } from "@/components/app/insights-panel"
import { OperationalTimeline } from "@/components/app/timeline"
import type { AnalyticsAction, AnalyticsInsight, AnalyticsSite, AnalyticsTimelineItem } from "@/lib/types"

type TabKey = "insights" | "actions" | "alerts" | "activity"

/**
 * IntelligenceHub — Insights, Recommended Actions, Risk & Alerts, and the
 * Operational Timeline consolidated into ONE card with a tab bar. Four
 * competing bordered panels read as clutter; one frame with a tab per lens
 * reads as a single "what's happening and what should I do" briefing, each
 * tab carrying its own count badge so nothing is hidden, just organised.
 */
export function IntelligenceHub({
  insights,
  actions,
  sites,
  timeline,
  onOpenSite,
  onOpenSiteObj,
}: {
  insights: AnalyticsInsight[]
  actions: AnalyticsAction[]
  sites: AnalyticsSite[]
  timeline: AnalyticsTimelineItem[]
  onOpenSite: (projectId: string) => void
  onOpenSiteObj: (s: AnalyticsSite) => void
}) {
  const alerts = deriveAlerts(sites)
  const criticalCount = alerts.filter((a) => a.level === "critical").length
  const [tab, setTab] = useState<TabKey>(criticalCount > 0 ? "alerts" : "insights")

  const TABS: { key: TabKey; label: string; icon: typeof Sparkles; count: number; badgeTone?: string }[] = [
    { key: "insights", label: "Insights", icon: Sparkles, count: insights.length },
    { key: "actions", label: "Actions", icon: Lightbulb, count: actions.length },
    { key: "alerts", label: "Alerts", icon: AlertOctagon, count: alerts.length, badgeTone: criticalCount > 0 ? "bg-danger text-white" : undefined },
    { key: "activity", label: "Activity", icon: ListTree, count: timeline.length },
  ]

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-card)">
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
              {t.count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0 text-[10.5px] font-bold leading-[15px]",
                    t.badgeTone ?? (active ? "bg-background/20" : "bg-muted-foreground/15"),
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="max-h-[380px] overflow-y-auto pr-1">
        {tab === "insights" && <InsightList insights={insights} onOpenSite={onOpenSite} />}
        {tab === "actions" && <ActionList actions={actions} onOpenSite={onOpenSite} />}
        {tab === "alerts" && <AlertList alerts={alerts} onOpen={onOpenSiteObj} />}
        {tab === "activity" && <OperationalTimeline items={timeline} />}
      </div>
    </div>
  )
}
