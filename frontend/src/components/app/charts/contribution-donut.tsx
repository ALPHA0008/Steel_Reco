import { useMemo, useState } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import type { AnalyticsParetoRow, AnalyticsSite } from "@/lib/types"

/**
 * Six categorical slots, keyed to a SITE and not to its rank. Cross-filtering
 * reorders these lists constantly; colouring by position would repaint every
 * surviving slice on each click and quietly reassign identity mid-read.
 *
 * The values live in index.css (--series-1..6, re-picked per theme) and are
 * validated for lightness band, chroma floor, CVD separation, normal-vision
 * separation and contrast. Six is the cap: a seventh site folds into "Other"
 * rather than getting a generated hue, which under colour-vision deficiency
 * would be indistinguishable from one already on screen.
 */
const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const

const config = {} satisfies ChartConfig

export type ContributionUnit = "MT" | "count"

function formatValue(v: number, unit: ContributionUnit): string {
  return unit === "count"
    ? v.toLocaleString("en-IN")
    : `${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`
}

/**
 * Share of a portfolio total by site, as a donut.
 *
 * Part-to-whole across six segments, which is the one job a pie does well. Two
 * deliberate departures from a plain pie:
 *
 *   - the hole carries the portfolio total, so the chart answers "how much in
 *     all?" as well as "who drives it";
 *   - every slice is also a legend row carrying its exact value, share and
 *     running cumulative.
 *
 * That second point is load-bearing rather than decorative. Real shares here
 * include 9.7% against 9.6% (APAS vs Grava on wastage) -- a pair nobody can
 * rank by eye from two arcs. Reading close values off a pie is the classic
 * failure of the form; the numbers beside it are what make it honest, and the
 * cumulative column preserves the Pareto reading ("two sites are 73% of it")
 * that the ranked-bar version carried.
 */
export function ContributionDonut({
  rows,
  allSites,
  unit,
  totalLabel,
  activeId,
  onToggleFilter,
}: {
  rows: AnalyticsParetoRow[]
  allSites: AnalyticsSite[]
  unit: ContributionUnit
  totalLabel: string
  activeId?: string | null
  onToggleFilter?: (s: AnalyticsSite) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const { slices, total } = useMemo(() => {
    // Colour index comes from the site's stable position in the full site list,
    // so a site keeps its hue no matter how the contribution list is sorted or
    // filtered.
    const orderOf = new Map(allSites.map((s, i) => [s.name, i]))
    const sum = rows.reduce((a, r) => a + r.value, 0)
    return {
      total: sum,
      slices: rows.map((r) => {
        const site = allSites.find((s) => s.name === r.name)
        return {
          name: r.name,
          value: r.value,
          cumulative: r.cumulative_pct,
          share: sum > 0 ? (r.value / sum) * 100 : 0,
          fill: SERIES[(orderOf.get(r.name) ?? 0) % SERIES.length],
          site,
          id: site?.project_id ?? r.name,
        }
      }),
    }
  }, [rows, allSites])

  const focus = hovered ?? activeId ?? null
  const focused = slices.find((s) => s.id === focus) ?? null

  // Deliberately a fresh array whenever the focus changes. Recharts renders its
  // sectors from `data` and does not re-render them when only a child <Cell>'s
  // props change, so carrying the dim state on the Cell alone left every slice
  // at full opacity -- the highlight silently did nothing.
  const chartData = slices.map((s) => ({
    ...s,
    fillOpacity: focus && focus !== s.id ? 0.3 : 1,
  }))

  return (
    <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:gap-7">
      <div className="relative shrink-0">
        <ChartContainer config={config} className="aspect-square h-[210px] w-[210px]">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={98}
              // A 2px gap of surface between segments: the boundary reads as a
              // boundary without a stroke drawing attention to itself.
              paddingAngle={1.5}
              strokeWidth={0}
              isAnimationActive={false}
              onMouseLeave={() => setHovered(null)}
            >
              {chartData.map((s) => (
                <Cell
                  key={s.id}
                  fill={s.fill}
                  // Dim the rest only once something is actually focused, so
                  // the resting state shows every site at full strength.
                  fillOpacity={s.fillOpacity}
                  className={cn(onToggleFilter && "cursor-pointer transition-opacity")}
                  onMouseEnter={() => setHovered(s.id)}
                  onClick={() => s.site && onToggleFilter?.(s.site)}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        {/* The hole. Shows the focused slice while hovering and the portfolio
            total otherwise, so pointing at a slice answers "how much is that?"
            without a floating tooltip covering its neighbours. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {focused ? (
            <>
              <span className="max-w-[104px] truncate text-[11px] font-medium text-muted-foreground">
                {focused.name}
              </span>
              <span className="tnum font-display text-[22px] leading-tight font-semibold">
                {focused.share.toFixed(1)}%
              </span>
              <span className="tnum text-[11px] text-muted-foreground">
                {formatValue(focused.value, unit)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {totalLabel}
              </span>
              <span className="tnum font-display text-[24px] leading-tight font-semibold">
                {formatValue(total, unit)}
              </span>
              <span className="text-[11px] text-muted-foreground">{slices.length} sites</span>
            </>
          )}
        </div>
      </div>

      {/* Legend, always present: identity is never carried by colour alone, and
          the exact numbers sit here in text tokens rather than in the hue.
          Capped rather than stretched to the panel: on a wide screen a full-width
          row leaves the site name and its number at opposite ends, which is a
          long horizontal scan to pair up two things that belong together. */}
      <ul className="grid w-full min-w-0 max-w-[520px] flex-1 gap-0.5">
        {slices.map((s) => {
          const isActive = activeId != null && s.id === activeId
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!s.site || !onToggleFilter}
                onClick={() => s.site && onToggleFilter?.(s.site)}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  "enabled:hover:bg-row-hover disabled:cursor-default",
                  isActive && "bg-brand-subtle",
                  focus && focus !== s.id && "opacity-55",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: s.fill }}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{s.name}</span>
                <span className="tnum shrink-0 text-[12.5px] font-semibold">
                  {s.share.toFixed(1)}%
                </span>
                <span className="tnum hidden w-[86px] shrink-0 text-right text-[11.5px] whitespace-nowrap text-muted-foreground sm:block">
                  {formatValue(s.value, unit)}
                </span>
                {/* whitespace-nowrap + room for the widest case ("100% cum."),
                    which otherwise wrapped onto a second line and pushed that
                    one row taller than the others. */}
                <span className="tnum hidden w-[74px] shrink-0 text-right text-[11.5px] whitespace-nowrap text-muted-foreground md:block">
                  {s.cumulative.toFixed(0)}% cum.
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
