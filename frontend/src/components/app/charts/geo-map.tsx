import { useState } from "react"
import { MapPin } from "lucide-react"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}

/**
 * Geo scatter of sites by their real lat/long — a "site constellation" that
 * keeps true relative positions (north = up, east = right) without an external
 * tile provider (blocked offline/CSP). Bubble size ∝ steel volume, color ∝
 * health. Sites with no coordinates are listed separately, honestly.
 */
export function GeoMap({
  sites,
  height = 300,
  onOpen,
}: {
  sites: AnalyticsSite[]
  height?: number
  onOpen?: (s: AnalyticsSite) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const geo = sites.filter((s) => s.latitude != null && s.longitude != null)
  const noGeo = sites.filter((s) => s.latitude == null || s.longitude == null)

  if (geo.length === 0) {
    return <div className="py-10 text-center text-[13px] text-muted-foreground">No site coordinates available.</div>
  }

  const lats = geo.map((s) => s.latitude as number)
  const lngs = geo.map((s) => s.longitude as number)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const padLat = (maxLat - minLat || 0.02) * 0.25 + 0.01
  const padLng = (maxLng - minLng || 0.02) * 0.25 + 0.01
  const maxVol = Math.max(1, ...geo.map((s) => s.received_mt))

  const W = 520
  const x = (lng: number) => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * W
  const y = (lat: number) => (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * height
  const r = (vol: number) => 7 + (vol / maxVol) * 22

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--info)_5%,var(--card))]">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }}>
          {/* faint graticule */}
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <line x1={f * W} y1={0} x2={f * W} y2={height} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
              <line x1={0} y1={f * height} x2={W} y2={f * height} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
            </g>
          ))}
          {/* connecting hairlines to centroid (constellation feel) */}
          {geo.map((s) => (
            <circle
              key={`halo-${s.project_id}`}
              cx={x(s.longitude as number)}
              cy={y(s.latitude as number)}
              r={r(s.received_mt) + 4}
              fill={healthColor(s.health)}
              opacity={0.08}
            />
          ))}
          {geo.map((s) => {
            const cx = x(s.longitude as number)
            const cy = y(s.latitude as number)
            const rad = r(s.received_mt)
            const color = healthColor(s.health)
            const active = hover === s.project_id
            return (
              <g key={s.project_id} className="cursor-pointer" onMouseEnter={() => setHover(s.project_id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(s)}>
                <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity={active ? 0.5 : 0.3} stroke={color} strokeWidth={2} />
                <circle cx={cx} cy={cy} r={2.5} fill={color} />
                <text x={cx} y={cy - rad - 4} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                  {s.name}
                </text>
              </g>
            )
          })}
        </svg>
        {hover && (() => {
          const s = geo.find((p) => p.project_id === hover)!
          return (
            <div className="pointer-events-none absolute left-2 top-2 rounded-lg border bg-background px-2.5 py-1.5 text-[11px] shadow-lg">
              <div className="font-semibold">{s.name}</div>
              <div className="text-muted-foreground">
                health {s.health} · {s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT · {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}
              </div>
            </div>
          )
        })()}
      </div>
      {noGeo.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="size-3.5" />
          No coordinates yet: {noGeo.map((s) => s.name).join(", ")}
        </div>
      )}
    </div>
  )
}
