/** Tiny inline SVG sparkline -- no chart library, no axes, just the shape of a
 * series. Used on the admin site cards to hint each site's wastage trajectory
 * at a glance. Draws a gradient area under the line and an emphasized endpoint.
 * Colour is inherited via `currentColor` so the caller sets tone (danger/success). */
export function Sparkline({
  data,
  width = 132,
  height = 36,
  className,
}: {
  data: number[]
  width?: number
  height?: number
  className?: string
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-hidden
      />
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w
    const y = pad + h - ((v - min) / span) * h
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${(height - pad).toFixed(1)} L${points[0][0].toFixed(1)},${(height - pad).toFixed(1)} Z`
  const [ex, ey] = points[points.length - 1]
  const gid = `spark-${Math.round(points[0][1] * 1000)}-${data.length}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={2.2} fill="currentColor" />
    </svg>
  )
}
