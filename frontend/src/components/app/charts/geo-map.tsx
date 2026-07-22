import { useState } from "react"
import { MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}
function healthLabel(h: number): string {
  if (h >= 75) return "Healthy"
  if (h >= 55) return "Stable"
  if (h >= 35) return "At risk"
  return "Critical"
}

// Approx km-per-degree at Hyderabad's latitude, for an honest scale bar.
const KM_PER_DEG_LAT = 111
function kmPerDegLng(lat: number) {
  return 111.32 * Math.cos((lat * Math.PI) / 180)
}

/**
 * Premium site map — real lat/long positions rendered as a stylised city map
 * (road grid, ground tint, compass, scale bar) rather than a bare scatter plot.
 * No external tile server is reachable offline/CSP, so this draws a believable
 * "satellite district" backdrop procedurally and plots every site at its true
 * relative position on top of it. Bubble size = steel volume, color = health.
 * Click a pin (or its label) to cross-filter the dashboard.
 */
export function GeoMap({
  sites,
  height = 320,
  activeId,
  onOpen,
}: {
  sites: AnalyticsSite[]
  height?: number
  activeId?: string | null
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
  const padLat = (maxLat - minLat || 0.03) * 0.35 + 0.015
  const padLng = (maxLng - minLng || 0.03) * 0.35 + 0.015
  const maxVol = Math.max(1, ...geo.map((s) => s.received_mt))
  const centerLat = (minLat + maxLat) / 2

  const W = 560
  const lo = { lat: minLat - padLat, lng: minLng - padLng }
  const hi = { lat: maxLat + padLat, lng: maxLng + padLng }
  const x = (lng: number) => ((lng - lo.lng) / (hi.lng - lo.lng)) * W
  const y = (lat: number) => (1 - (lat - lo.lat) / (hi.lat - lo.lat)) * height
  const r = (vol: number) => 8 + (vol / maxVol) * 18

  // scale bar: pick a "nice" km length that's a reasonable fraction of the view width
  const viewWidthKm = (hi.lng - lo.lng) * kmPerDegLng(centerLat)
  const niceKm = [1, 2, 5, 10, 20, 50].reduce((best, v) => (Math.abs(v - viewWidthKm / 4) < Math.abs(best - viewWidthKm / 4) ? v : best), 5)
  const scaleBarPx = (niceKm / kmPerDegLng(centerLat) / (hi.lng - lo.lng)) * W

  // procedural road grid, seeded off the bounding box so it's stable across renders
  const roadsMajor = [0.22, 0.5, 0.78]
  const roadsMinor = [0.12, 0.35, 0.65, 0.88]

  const active = hover ?? activeId ?? null

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border border-border/60"
        style={{
          height,
          background:
            "radial-gradient(120% 100% at 20% 0%, color-mix(in srgb, var(--success) 7%, var(--card)), color-mix(in srgb, var(--info) 6%, var(--card)) 55%, var(--card) 100%)",
        }}
      >
        <svg viewBox={`0 0 ${W} ${height}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          {/* soft district blocks (procedural city texture) */}
          {roadsMajor.map((fx, i) =>
            roadsMajor.map((fy, j) => (
              <rect
                key={`b${i}${j}`}
                x={fx * W - W * 0.07}
                y={fy * height - height * 0.09}
                width={W * 0.14}
                height={height * 0.18}
                rx={6}
                fill="var(--muted-foreground)"
                opacity={0.035}
              />
            )),
          )}
          {/* road grid */}
          {roadsMajor.map((f) => (
            <line key={`vM${f}`} x1={f * W} y1={0} x2={f * W} y2={height} stroke="var(--border)" strokeWidth={2.2} opacity={0.55} />
          ))}
          {roadsMajor.map((f) => (
            <line key={`hM${f}`} x1={0} y1={f * height} x2={W} y2={f * height} stroke="var(--border)" strokeWidth={2.2} opacity={0.55} />
          ))}
          {roadsMinor.map((f) => (
            <line key={`vm${f}`} x1={f * W} y1={0} x2={f * W} y2={height} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
          ))}
          {roadsMinor.map((f) => (
            <line key={`hm${f}`} x1={0} y1={f * height} x2={W} y2={f * height} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
          ))}

          {/* health halos */}
          {geo.map((s) => (
            <circle
              key={`halo-${s.project_id}`}
              cx={x(s.longitude as number)}
              cy={y(s.latitude as number)}
              r={r(s.received_mt) + 6}
              fill={healthColor(s.health)}
              opacity={active === s.project_id ? 0.16 : 0.07}
            />
          ))}

          {/* pins */}
          {geo.map((s) => {
            const cx = x(s.longitude as number)
            const cy = y(s.latitude as number)
            const rad = r(s.received_mt)
            const color = healthColor(s.health)
            const isActive = active === s.project_id
            return (
              <g
                key={s.project_id}
                className="cursor-pointer"
                onMouseEnter={() => setHover(s.project_id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onOpen?.(s)}
              >
                {isActive && (
                  <circle cx={cx} cy={cy} r={rad + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6}>
                    <animate attributeName="r" values={`${rad + 4};${rad + 9};${rad + 4}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity={isActive ? 0.55 : 0.34} stroke={color} strokeWidth={isActive ? 2.5 : 1.5} />
                <circle cx={cx} cy={cy} r={2.5} fill={color} />
                {/* label chip */}
                <g transform={`translate(${cx}, ${cy - rad - 9})`}>
                  <rect x={-((s.name.length * 3.6) / 2 + 5)} y={-8} width={s.name.length * 3.6 + 10} height={14} rx={7} fill="var(--card)" stroke="var(--border)" strokeWidth={0.75} opacity={0.96} />
                  <text x={0} y={2} textAnchor="middle" className="fill-foreground text-[8px] font-semibold">{s.name}</text>
                </g>
              </g>
            )
          })}
        </svg>

        {/* compass */}
        <div className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border bg-card/90 shadow-sm backdrop-blur">
          <Navigation className="size-4 text-muted-foreground" />
        </div>

        {/* scale bar */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          <div className="h-1 rounded-full bg-foreground/40" style={{ width: Math.max(20, scaleBarPx) }} />
          <span className="text-[9.5px] font-medium text-muted-foreground">{niceKm} km</span>
        </div>

        {/* region label */}
        <div className="absolute left-3 top-3 rounded-full border bg-card/90 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
          Hyderabad, Telangana
        </div>

        {hover && (() => {
          const s = geo.find((p) => p.project_id === hover)!
          return (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl border bg-background px-3 py-2 text-[11px] shadow-xl">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <span className="size-2 rounded-full" style={{ background: healthColor(s.health) }} />
                {s.name}
                <span className="ml-1 font-normal text-muted-foreground">· {healthLabel(s.health)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>Steel</span><span className="tnum text-right text-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
                <span>Wastage</span><span className="tnum text-right text-foreground">{s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}</span>
                <span>Exceptions</span><span className="tnum text-right text-foreground">{s.open_exceptions.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )
        })()}
      </div>
      {noGeo.length > 0 && (
        <div className={cn("mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground")}>
          <MapPin className="size-3.5" />
          No coordinates yet: {noGeo.map((s) => s.name).join(", ")}
        </div>
      )}
    </div>
  )
}
