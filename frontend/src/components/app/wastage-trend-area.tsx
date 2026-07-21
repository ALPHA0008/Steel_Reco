import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { WastageTrendPoint } from "@/lib/types"

const chartConfig = {
  wastage: { label: "Wastage %", color: "var(--chart-1)" },
} satisfies ChartConfig

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
}

/** Option A: shadcn's own Area Chart block (Recharts) -- gradient fill under
 * the line, native tooltip/grid/axis styling, a dashed reference line for
 * the contract cap. The "native shadcn" feel -- matches every other chart
 * this design system ships out of the box. */
export function WastageTrendArea({ points, capPct }: { points: WastageTrendPoint[]; capPct: number }) {
  const data = points.map((p) => ({
    label: monthLabel(p.year, p.month),
    wastage: p.wastage_pct === null ? null : Number(p.wastage_pct),
  }))

  // Some sites (e.g. APAS) only have a wastage figure at month-end close, so
  // almost every point is null and a line/area has nothing to draw. Per the
  // data-viz form rule "a single ratio against a limit -> meter", we render a
  // cap meter (not an empty chart, not a bare number): the reading against its
  // contract cap, on a track whose scale matches the trend charts (0..max).
  const real = data.filter((d) => d.wastage !== null) as { label: string; wastage: number }[]
  if (real.length < 2) {
    const latest = real[real.length - 1]
    if (!latest) {
      return (
        <div className="flex h-[260px] items-center justify-center text-[13px] text-muted-foreground">
          No wastage readings recorded yet.
        </div>
      )
    }
    const over = latest.wastage > capPct
    const scaleMax = Math.max(capPct * 1.6, latest.wastage * 1.25, 4) // headroom, aligns with chart y-scale feel
    const fillPct = Math.min(100, (latest.wastage / scaleMax) * 100)
    const capMarkPct = Math.min(100, (capPct / scaleMax) * 100)
    const color = over ? "var(--danger)" : "var(--success)"
    return (
      <div className="flex h-[260px] flex-col justify-center gap-6 px-2">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Wastage at latest close · {latest.label}
            </div>
            <div
              className="font-display mt-1 text-[44px] font-semibold leading-none tracking-tight"
              style={{ color }}
            >
              {latest.wastage.toFixed(2)}%
            </div>
          </div>
          <div
            className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{
              color,
              background: over ? "var(--danger-subtle)" : "var(--success-subtle)",
            }}
          >
            {over ? `▲ ${(latest.wastage - capPct).toFixed(2)}% over cap` : `within ${capPct.toFixed(1)}% cap`}
          </div>
        </div>

        {/* Cap meter: the single reading against its contract cap */}
        <div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: color }} />
            {/* contract cap tick */}
            <div
              className="absolute inset-y-0 w-0.5"
              style={{ left: `${capMarkPct}%`, background: "var(--foreground)", opacity: 0.55 }}
            />
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
            <span className="absolute left-0">0%</span>
            <span
              className="absolute -translate-x-1/2 font-medium"
              style={{ left: `${capMarkPct}%`, color: "var(--danger)" }}
            >
              {capPct.toFixed(1)}% cap
            </span>
            <span className="absolute right-0">{scaleMax.toFixed(0)}%</span>
          </div>
        </div>

        <div className="text-[12px] text-muted-foreground">
          This site records physical stock only at month-end close, so a single reconciled reading is
          available. A month-by-month curve appears once interim physical counts are captured.
        </div>
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 12, right: 12, top: 12 }}>
        <defs>
          <linearGradient id="fillWastage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-wastage)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-wastage)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={40}
          tickFormatter={(v) => `${v}%`}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(value) => [`${Number(value).toFixed(2)}%`, "Wastage"]} />}
        />
        <ReferenceLine
          y={capPct}
          stroke="var(--danger)"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: `${capPct.toFixed(1)}% cap`, position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }}
        />
        <Area
          dataKey="wastage"
          type="monotone"
          fill="url(#fillWastage)"
          stroke="var(--color-wastage)"
          strokeWidth={2}
          connectNulls
        />
      </AreaChart>
    </ChartContainer>
  )
}
