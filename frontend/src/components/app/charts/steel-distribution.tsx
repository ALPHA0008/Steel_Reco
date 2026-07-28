import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}

const config = { received: { label: "Steel received (MT)" } } satisfies ChartConfig

/**
 * Steel distribution as a horizontal bar chart (replaces the cramped treemap,
 * whose tiny rotated labels carried no value). Bars are ranked high→low, each
 * colored by the site's health band, with the MT value labelled at the end and
 * the site name on the axis. Click a bar to cross-filter.
 */
export function SteelDistributionBars({
  sites,
  activeId,
  onOpen,
}: {
  sites: AnalyticsSite[]
  activeId?: string | null
  onOpen?: (s: AnalyticsSite) => void
}) {
  const rows = [...sites]
    .filter((s) => s.received_mt > 0)
    .sort((a, b) => b.received_mt - a.received_mt)
    .map((s) => ({
      id: s.project_id,
      name: s.name,
      received: Math.round(s.received_mt),
      fill: healthColor(s.health),
      dim: activeId != null && activeId !== s.project_id,
      site: s,
    }))

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart
          accessibilityLayer
          data={rows}
          layout="vertical"
          margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
          barCategoryGap={10}
        >
          <YAxis
            dataKey="name"
            type="category"
            tickLine={false}
            axisLine={false}
            width={92}
            tick={{ fontSize: 12.5 }}
          />
          <XAxis dataKey="received" type="number" hide />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as (typeof rows)[number]
              return (
                <div className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[11px] shadow-lg">
                  <div className="mb-0.5 font-semibold">{r.name}</div>
                  <div className="grid grid-cols-2 gap-x-3 text-muted-foreground">
                    <span>Received</span><span className="tnum text-right text-foreground">{r.received.toLocaleString("en-IN")} MT</span>
                    <span>Wastage</span><span className="tnum text-right text-foreground">{r.site.wastage_pct == null ? "—" : `${r.site.wastage_pct.toFixed(2)}%`}</span>
                    <span>Health</span><span className="tnum text-right text-foreground">{r.site.health}</span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="received" radius={6} isAnimationActive onClick={(_: unknown, i: number) => onOpen?.(rows[i].site)} className="cursor-pointer">
            {rows.map((r) => (
              <Cell key={r.id} fill={r.fill} fillOpacity={r.dim ? 0.3 : 0.9} />
            ))}
            <LabelList
              dataKey="received"
              position="right"
              offset={8}
              className="fill-foreground"
              fontSize={11.5}
              formatter={(v: number) => `${(v / 1000).toFixed(1)}k MT`}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex items-center justify-center gap-3 text-[10.5px] text-muted-foreground">
        <span>Bar = steel received · color = health:</span>
        {[["Critical", "var(--danger)"], ["At risk", "var(--warning)"], ["Stable", "var(--info)"], ["Healthy", "var(--success)"]].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: c }} /> {l}
          </span>
        ))}
      </div>
    </div>
  )
}
