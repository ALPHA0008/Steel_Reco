import { ArrowRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { HealthGauge } from "@/components/app/health-gauge"
import type { AnalyticsNarrative } from "@/lib/types"

function gradeColor(g: string): string {
  return g === "A" ? "var(--success)" : g === "B" ? "var(--info)" : g === "C" ? "var(--warning)" : "var(--danger)"
}

function crore(inr: number): string {
  const cr = inr / 1_00_00_000
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`
  const lakh = inr / 1_00_000
  return `₹${lakh.toFixed(1)} L`
}

/**
 * Executive narrative hero — a compact analyst-style brief built to sit at
 * HALF page width (beside the site map): gauge + grade on top, the synthesized
 * headline, then a tight metric row, then the recommended next step. Answers
 * "is it healthy / why / what next / what's the impact" without needing full
 * page width.
 */
export function ExecutiveSummary({
  n,
  onOpenDriver,
}: {
  n: AnalyticsNarrative
  onOpenDriver?: (projectId: string) => void
}) {
  const up = n.health_wow_delta_pp > 0.02 // wastage up = health down
  const gc = gradeColor(n.grade)

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-6">
      {/* subtle industrial blueprint grid + accent wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(140% 90% at 10% 0%, black, transparent 70%)",
        }}
      />

      <div className="relative flex flex-1 flex-col justify-between gap-5">
        {/* Top: gauge + grade + headline */}
        <div className="flex items-center gap-5">
          <HealthGauge score={n.health} size={116} label="" showBand={false} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-md bg-brand-subtle text-brand-text">
                <Sparkles className="size-3" />
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Executive summary</span>
              <span
                className="font-display ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-[14px] font-bold text-white"
                style={{ background: gc }}
              >
                {n.grade}
              </span>
              <span className={cn("flex shrink-0 items-center gap-1 text-[11px] font-semibold", up ? "text-danger" : "text-success")}>
                {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {Math.abs(n.health_wow_delta_pp).toFixed(2)}pp
              </span>
            </div>
            <p className="text-[16px] font-semibold leading-snug tracking-tight text-foreground text-balance">
              {n.headline}
            </p>
          </div>
        </div>

        {/* metric strip */}
        <div className="grid grid-cols-3 gap-3 border-y border-border/50 py-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Wastage</div>
            <div className="tnum mt-0.5 text-[19px] font-semibold" style={{ color: "var(--danger)" }}>
              {n.wastage_pct == null ? "—" : `${n.wastage_pct.toFixed(2)}%`}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Forecast</div>
            <div className="tnum mt-0.5 text-[19px] font-semibold text-foreground">
              {n.forecast_pct == null ? "—" : `${n.forecast_pct.toFixed(2)}%`}
            </div>
          </div>
          <div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title={`Savings per 1pp at ${n.driver_site ?? "driver"}`}>
              Savings/1pp
            </div>
            <div className="tnum mt-0.5 text-[19px] font-semibold text-success">
              {crore(n.savings_inr_per_pp)}
            </div>
          </div>
        </div>

        {/* wastage-vs-cap meter — fills the space with a real reading */}
        {n.wastage_pct != null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Portfolio wastage vs {n.target_wastage_pct.toFixed(0)}% cap</span>
              <span className={n.wastage_pct > n.target_wastage_pct ? "text-danger" : "text-success"}>
                {n.wastage_pct > n.target_wastage_pct ? "+" : ""}{(n.wastage_pct - n.target_wastage_pct).toFixed(2)}pp
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, (n.wastage_pct / (n.target_wastage_pct * 2)) * 100)}%`,
                  background: n.wastage_pct > n.target_wastage_pct ? "var(--danger)" : "var(--success)",
                }}
              />
              <div className="absolute inset-y-[-2px] w-0.5 bg-foreground/60" style={{ left: "50%" }} title={`${n.target_wastage_pct}% cap`} />
            </div>
          </div>
        )}

        {/* recommended next step */}
        <button
          type="button"
          disabled={!n.driver_project_id || !onOpenDriver}
          onClick={() => n.driver_project_id && onOpenDriver?.(n.driver_project_id)}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-xl bg-foreground px-4 py-3 text-left text-background transition-all",
            n.driver_project_id && onOpenDriver && "hover:shadow-lg",
          )}
        >
          <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-background/60">Next step</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{n.next_step}</span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </section>
  )
}
