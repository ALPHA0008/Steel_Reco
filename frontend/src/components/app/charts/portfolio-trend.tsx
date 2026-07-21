import { Area, ComposedChart, Line, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  wastage: { label: "Portfolio wastage %", color: "var(--chart-1)" },
  moving_avg: { label: "3-mo moving avg", color: "var(--chart-2)" },
} satisfies ChartConfig

function monthLabel(y: number, m: number): string {
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
}

/**
 * Portfolio wastage trend with a moving-average line, the cap reference, and a
 * dashed forecast segment to next month's projection. Answers "which way is
 * the whole portfolio heading?"
 */
export function PortfolioTrend({
  points,
  forecast,
  capPct = 3,
}: {
  points: { year: number; month: number; wastage_pct: number; moving_avg: number | null }[]
  forecast: number | null
  capPct?: number
}) {
  const data: {
    label: string
    wastage: number | null
    moving_avg: number | null
    forecast?: number | null
  }[] = points.map((p) => ({
    label: monthLabel(p.year, p.month),
    wastage: p.wastage_pct,
    moving_avg: p.moving_avg,
  }))

  // append a forecast point
  if (forecast != null && points.length > 0) {
    const last = points[points.length - 1]
    const ny = last.month === 12 ? last.year + 1 : last.year
    const nm = last.month === 12 ? 1 : last.month + 1
    // bridge: give the last real point a forecast value so the dashed line connects
    data[data.length - 1] = { ...data[data.length - 1], forecast: data[data.length - 1].wastage }
    data.push({ label: monthLabel(ny, nm), wastage: null, moving_avg: null, forecast })
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 12, top: 12 }}>
        <defs>
          <linearGradient id="fillPortfolio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-wastage)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-wastage)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={38} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v, n) => [`${Number(v).toFixed(2)}%`, n === "forecast" ? "Projected" : n === "moving_avg" ? "3-mo avg" : "Wastage"]} />} />
        <ReferenceLine y={capPct} stroke="var(--danger)" strokeDasharray="4 3" strokeWidth={1.2} label={{ value: `${capPct.toFixed(1)}% cap`, position: "insideTopRight", fill: "var(--danger)", fontSize: 10 }} />
        <Area dataKey="wastage" type="monotone" fill="url(#fillPortfolio)" stroke="var(--color-wastage)" strokeWidth={2} connectNulls />
        <Line dataKey="moving_avg" type="monotone" stroke="var(--color-moving_avg)" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="1 0" />
        <Line dataKey="forecast" type="monotone" stroke="var(--color-wastage)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        {forecast != null && data.length > 0 && (
          <ReferenceDot x={data[data.length - 1].label} y={forecast} r={4} fill="var(--color-wastage)" stroke="var(--card)" strokeWidth={2} />
        )}
      </ComposedChart>
    </ChartContainer>
  )
}
