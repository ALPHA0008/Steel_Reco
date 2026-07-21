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
 * Executive narrative hero — the dominant centerpiece. An analyst-style brief:
 * grade + health gauge, the synthesized headline, forecast, directional
 * savings, and the single recommended next step. Answers "is it healthy / why
 * / what next / what's the impact" in one glance.
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
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* subtle industrial blueprint grid + accent wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(120% 80% at 15% 0%, black, transparent 70%)",
        }}
      />
      <div className="relative grid grid-cols-[220px_1fr] gap-8 p-7">
        {/* Left: grade + gauge */}
        <div className="flex flex-col items-center justify-center gap-4 border-r border-border/50 pr-2">
          <HealthGauge score={n.health} size={168} label="Portfolio Health" />
          <div className="flex items-center gap-2">
            <span
              className="font-display grid size-10 place-items-center rounded-xl text-[22px] font-bold text-white"
              style={{ background: gc }}
            >
              {n.grade}
            </span>
            <div className="text-left">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Grade</div>
              <div
                className={cn("flex items-center gap-1 text-[12px] font-semibold", up ? "text-danger" : "text-success")}
              >
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {Math.abs(n.health_wow_delta_pp).toFixed(2)} pp MoM
              </div>
            </div>
          </div>
        </div>

        {/* Right: narrative */}
        <div className="flex flex-col justify-center">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-brand-subtle text-brand-text">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Executive summary
            </span>
          </div>

          <p className="max-w-[62ch] text-[19px] font-semibold leading-snug tracking-tight text-foreground text-balance">
            {n.headline}
          </p>

          {/* metric strip */}
          <div className="mt-5 grid grid-cols-3 gap-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Portfolio wastage</div>
              <div className="tnum mt-0.5 text-[22px] font-semibold" style={{ color: "var(--danger)" }}>
                {n.wastage_pct == null ? "—" : `${n.wastage_pct.toFixed(2)}%`}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next-month forecast</div>
              <div className="tnum mt-0.5 text-[22px] font-semibold text-foreground">
                {n.forecast_pct == null ? "—" : `${n.forecast_pct.toFixed(2)}%`}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Savings / 1pp at {n.driver_site ?? "driver"}
              </div>
              <div className="tnum mt-0.5 text-[22px] font-semibold text-success">
                {crore(n.savings_inr_per_pp)}
                <span className="ml-1 text-[12px] font-normal text-muted-foreground">/yr · {n.savings_mt_per_pp.toLocaleString("en-IN")} MT</span>
              </div>
            </div>
          </div>

          {/* recommended next step */}
          <button
            type="button"
            disabled={!n.driver_project_id || !onOpenDriver}
            onClick={() => n.driver_project_id && onOpenDriver?.(n.driver_project_id)}
            className={cn(
              "group mt-6 flex w-fit items-center gap-2.5 rounded-xl bg-foreground px-4 py-2.5 text-left text-background transition-all",
              n.driver_project_id && onOpenDriver && "hover:gap-3.5 hover:shadow-lg",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-background/60">Next step</span>
            <span className="text-[13.5px] font-semibold">{n.next_step}</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  )
}
