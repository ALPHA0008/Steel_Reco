import { ArrowRight, Clock, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { HealthGauge } from "@/components/app/health-gauge"
import type { AnalyticsNarrative } from "@/lib/types"

function gradeColor(g: string): string {
  return g === "A" ? "var(--success)" : g === "B" ? "var(--info)" : g === "C" ? "var(--warning)" : "var(--danger)"
}
function crore(inr: number): string {
  const cr = inr / 1_00_00_000
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`
  return `₹${(inr / 1_00_000).toFixed(1)} L`
}
function relTime(iso: string | null): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.round(hrs / 24)} d ago`
}

/** A labelled briefing field. */
function Field({ label, value, tone, foot }: { label: string; value: React.ReactNode; tone?: string; foot?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[17px] font-semibold leading-tight tracking-tight", tone)}>{value}</div>
      {foot && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{foot}</div>}
    </div>
  )
}

/**
 * Mission Control hero — the brain of the dashboard. Left: health gauge + grade
 * + trend + forecast (the status block). Right: a consultant-style briefing —
 * primary risk, potential savings, recommended action, expected improvement —
 * with a next-step CTA and a last-refresh trust indicator.
 */
export function ExecutiveSummary({
  n,
  generatedAt,
  onOpenDriver,
}: {
  n: AnalyticsNarrative
  generatedAt?: string | null
  onOpenDriver?: (projectId: string) => void
}) {
  const up = n.health_wow_delta_pp > 0.02
  const gc = gradeColor(n.grade)
  const status = n.health >= 75 ? "Healthy" : n.health >= 55 ? "Stable" : n.health >= 40 ? "At risk" : "Critical"
  // Expected portfolio improvement if the driver's wastage is cut 1pp: 1pp of
  // the driver's consumption as a share of total consumption. Approximated by
  // its wastage-contribution share (driver drives X% of wastage qty), capped.
  const expectedImprovementPp = n.wastage_pct != null ? Math.round(n.driver_share_pct * 0.01 * 100) / 100 : null

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(130% 90% at 12% 0%, black, transparent 72%)",
        }}
      />
      <div className="relative flex items-center justify-between border-b border-border/50 px-7 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-lg bg-brand-subtle text-brand-text">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mission control</span>
        </div>
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Clock className="size-3.5" /> Updated {relTime(generatedAt ?? null)}
        </span>
      </div>

      <div className="relative grid grid-cols-[240px_1fr] gap-8 p-7">
        {/* Status block */}
        <div className="flex flex-col items-center gap-4 border-r border-border/50 pr-2">
          <HealthGauge score={n.health} size={172} label="Portfolio Health" />
          <div className="grid w-full grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-2">
              <span className="font-display grid size-8 place-items-center rounded-lg text-[16px] font-bold text-white" style={{ background: gc }}>{n.grade}</span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">Grade</div>
                <div className="text-[12px] font-semibold" style={{ color: gc }}>{status}</div>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 px-2.5 py-2">
              <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">Trend</div>
              <div className={cn("flex items-center gap-1 text-[12px] font-semibold", up ? "text-danger" : "text-success")}>
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {Math.abs(n.health_wow_delta_pp).toFixed(2)} pp
              </div>
            </div>
          </div>
        </div>

        {/* Briefing */}
        <div className="flex flex-col justify-center">
          <p className="max-w-[64ch] text-[19px] font-semibold leading-snug tracking-tight text-foreground text-balance">
            {n.headline}
          </p>

          <div className="mt-5 grid grid-cols-4 gap-5">
            <Field label="Primary risk" value={n.driver_site ?? "—"} tone="text-danger" foot={`${n.driver_share_pct.toFixed(0)}% of portfolio wastage`} />
            <Field label="Next-month forecast" value={n.forecast_pct == null ? "—" : `${n.forecast_pct.toFixed(2)}%`} foot="3-mo projection" />
            <Field label="Potential savings" value={<span className="text-success">{crore(n.savings_inr_per_pp)}</span>} foot={`per 1pp · ${n.savings_mt_per_pp.toLocaleString("en-IN")} MT/yr`} />
            <Field label="Expected improvement" value={expectedImprovementPp != null ? `-${expectedImprovementPp.toFixed(1)}%` : "—"} tone="text-success" foot="portfolio wastage" />
          </div>

          <button
            type="button"
            disabled={!n.driver_project_id || !onOpenDriver}
            onClick={() => n.driver_project_id && onOpenDriver?.(n.driver_project_id)}
            className={cn(
              "group mt-6 flex w-fit items-center gap-2.5 rounded-xl bg-foreground px-4 py-2.5 text-left text-background transition-all",
              n.driver_project_id && onOpenDriver && "hover:gap-3.5 hover:shadow-lg",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-background/60">Recommended action</span>
            <span className="text-[13.5px] font-semibold">{n.next_step}</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  )
}
