import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { HealthGauge } from "@/components/app/health-gauge"
import type { AnalyticsNarrative } from "@/lib/types"

/**
 * Executive narrative hero — a compact analyst-style brief built to sit at
 * HALF page width (beside the site map): health gauge and the synthesized
 * headline on top, a tight metric row, the wastage-vs-cap meter, then the
 * recommended next step. Answers "is it healthy / why / what next" without
 * needing full page width.
 */
export function ExecutiveSummary({
  n,
  onOpenDriver,
}: {
  n: AnalyticsNarrative
  onOpenDriver?: (projectId: string) => void
}) {
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
        {/* Top: gauge + headline */}
        <div className="flex items-center gap-5">
          <HealthGauge score={n.health} size={116} label="" showBand={false} />
          <div className="min-w-0 flex-1">
            {/* Eyebrow only. The letter grade and the week-on-week delta used to
                sit here, and both were saying what the gauge beside them already
                says -- a score out of 100 does not also need a D stamped next to
                it, and a 0.21pp move is inside the noise of a figure quoted to
                two decimals. The headline underneath is the actual verdict. */}
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-md bg-brand-subtle text-brand-text">
                <Sparkles className="size-3" />
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Executive summary</span>
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
          {/* "Sites over cap" rather than the rupee figure that was here.
              Savings/1pp was steel price x tonnage-per-point -- an estimate
              resting on a price assumption, quoted in crore beside two measured
              percentages, which lent it more authority than it had earned. This
              is counted, not modelled, and it says how widespread the problem is
              rather than what fixing it might be worth. */}
          <div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Over cap
            </div>
            <div
              className={cn(
                "tnum mt-0.5 text-[19px] font-semibold",
                n.sites_over_cap > 0 ? "text-danger" : "text-success",
              )}
            >
              {n.sites_over_cap}
              <span className="text-[13px] font-medium text-muted-foreground"> of {n.site_count}</span>
            </div>
          </div>
        </div>

        {/* wastage-vs-cap meter — fills the space with a real reading */}
        {n.wastage_pct != null && (
          <div>
            {/* Label only. The signed pp gap that sat on the right restated the
                two numbers already on screen -- wastage in the strip above, the
                cap as the marker on the track below -- and the bar overshooting
                its marker shows the overage without arithmetic. */}
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Portfolio wastage vs {n.target_wastage_pct.toFixed(0)}% cap
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
            "group flex w-full items-center gap-2.5 rounded-xl bg-foreground px-4 py-3 text-left text-background transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.99]",
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
