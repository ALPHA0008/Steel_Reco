import { AlertOctagon, AlertTriangle, ArrowUpRight, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

type Level = "critical" | "warning" | "info"
interface Alert {
  level: Level
  title: string
  detail: string
  site: AnalyticsSite
}

const LEVEL_META: Record<Level, { icon: typeof Info; ring: string; text: string; order: number }> = {
  critical: { icon: AlertOctagon, ring: "bg-danger-subtle text-danger", text: "text-danger", order: 0 },
  warning: { icon: AlertTriangle, ring: "bg-warning-subtle text-warning", text: "text-warning", order: 1 },
  info: { icon: Info, ring: "bg-info-subtle text-info", text: "text-info", order: 2 },
}

/** Derive prioritized operational alerts from the site facts. Red is reserved
 * for genuine critical conditions (well over cap / critical risk). */
function deriveAlerts(sites: AnalyticsSite[]): Alert[] {
  const out: Alert[] = []
  for (const s of sites) {
    if (s.wastage_pct != null && s.wastage_pct > s.cap_pct * 1.5) {
      out.push({ level: "critical", title: `${s.name} wastage far over cap`, detail: `${s.wastage_pct.toFixed(2)}% vs ${s.cap_pct.toFixed(0)}% cap`, site: s })
    } else if (s.over_cap) {
      out.push({ level: "warning", title: `${s.name} over wastage cap`, detail: `${s.wastage_pct?.toFixed(2)}% vs ${s.cap_pct.toFixed(0)}% cap`, site: s })
    }
    if (s.open_exceptions >= 500) {
      out.push({ level: "warning", title: `${s.name} exception backlog`, detail: `${s.open_exceptions.toLocaleString("en-IN")} open flags need review`, site: s })
    }
    // deteriorating trend
    const reals = s.spark
    if (reals.length >= 2 && reals[reals.length - 1] > reals[reals.length - 2] + 0.1) {
      out.push({ level: "info", title: `${s.name} trending up`, detail: `latest close rose to ${reals[reals.length - 1].toFixed(2)}%`, site: s })
    }
  }
  return out.sort((a, b) => LEVEL_META[a.level].order - LEVEL_META[b.level].order)
}

export function AlertsCenter({ sites, onOpen }: { sites: AnalyticsSite[]; onOpen: (s: AnalyticsSite) => void }) {
  const alerts = deriveAlerts(sites)
  const criticalCount = alerts.filter((a) => a.level === "critical").length
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-card)">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-danger-subtle text-danger">
            <AlertOctagon className="size-4" />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight">Risk & alerts</h2>
        </div>
        {criticalCount > 0 && (
          <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{criticalCount} critical</span>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-muted-foreground">No active alerts.</div>
      ) : (
        <ul className="space-y-1.5">
          {alerts.map((a, i) => {
            const m = LEVEL_META[a.level]
            const Icon = m.icon
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onOpen(a.site)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2 text-left transition-colors hover:border-brand-border hover:bg-row-hover"
                >
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", m.ring)}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{a.title}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{a.detail}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
