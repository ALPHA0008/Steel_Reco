import { useState } from "react"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "var(--success)"
  if (h >= 55) return "var(--info)"
  if (h >= 35) return "var(--warning)"
  return "var(--danger)"
}

// India geographic bounding box (approx) for a simple equirectangular projection.
const IND = { minLng: 68.1, maxLng: 97.4, minLat: 6.5, maxLat: 37.1 }
const VB = { w: 500, h: 560 }

// Simplified India outline (single path, low-detail — enough to read as India,
// no external tiles). Coordinates are in the 500x560 viewBox space.
const INDIA_PATH =
  "M196 40 L232 44 L250 66 L286 60 L300 78 L330 74 L350 96 L342 122 L366 140 L358 166 L392 178 L410 206 L398 232 L420 250 L404 276 L378 286 L372 316 L392 340 L372 360 L380 392 L356 404 L352 438 L330 452 L322 486 L300 512 L286 544 L270 512 L262 470 L244 442 L236 404 L214 382 L206 348 L184 330 L166 296 L150 262 L128 240 L106 210 L92 178 L110 156 L98 128 L124 116 L130 88 L160 82 L172 56 Z"

function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - IND.minLng) / (IND.maxLng - IND.minLng)) * VB.w
  const y = (1 - (lat - IND.minLat) / (IND.maxLat - IND.minLat)) * VB.h
  return { x, y }
}

/**
 * Offline India map: the country outline with each site plotted at its REAL
 * lat/long, bubble size = steel volume, color = health. Rich hover card,
 * click-to-filter. Works with no external tile provider (strict CSP / offline).
 * The Hyderabad sites cluster tightly, so an inset zoom shows them spread out.
 */
export function IndiaMap({
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
  const maxVol = Math.max(1, ...geo.map((s) => s.received_mt))

  // inset: sites cluster around Hyderabad; show a zoomed panel of just them
  const lats = geo.map((s) => s.latitude as number)
  const lngs = geo.map((s) => s.longitude as number)
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const spread = Math.max(0.06, Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs)) * 1.5
  const IW = 200, IH = 200
  const insetX = (lng: number) => ((lng - (cLng - spread / 2)) / spread) * IW
  const insetY = (lat: number) => (1 - (lat - (cLat - spread / 2)) / spread) * IH
  const r = (vol: number) => 6 + (vol / maxVol) * 16

  const active = hover ?? activeId ?? null

  return (
    <div>
      <div className="relative flex gap-3">
        {/* India outline with a marker at the cluster centroid */}
        <div className="relative flex-1 overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--info)_4%,var(--card))]" style={{ height }}>
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <path d={INDIA_PATH} fill="color-mix(in srgb, var(--muted-foreground) 12%, transparent)" stroke="var(--border)" strokeWidth={1.5} />
            {(() => {
              const c = project(cLat, cLng)
              return (
                <g>
                  <circle cx={c.x} cy={c.y} r={7} fill="var(--brand)" opacity={0.25} />
                  <circle cx={c.x} cy={c.y} r={3.5} fill="var(--brand)" />
                  <text x={c.x} y={c.y - 10} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">Hyderabad</text>
                </g>
              )
            })()}
          </svg>
          <div className="absolute bottom-2 left-3 text-[10px] text-muted-foreground">India · {geo.length} sites near Hyderabad →</div>
        </div>

        {/* Zoomed cluster inset — the actual sites */}
        <div className="relative shrink-0 overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--info)_5%,var(--card))]" style={{ width: IW, height }}>
          <svg viewBox={`0 0 ${IW} ${IH}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {[0.33, 0.66].map((f) => (
              <g key={f}>
                <line x1={f * IW} y1={0} x2={f * IW} y2={IH} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
                <line x1={0} y1={f * IH} x2={IW} y2={f * IH} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
              </g>
            ))}
            {geo.map((s) => {
              const cx = insetX(s.longitude as number)
              const cy = insetY(s.latitude as number)
              const rad = r(s.received_mt)
              const color = healthColor(s.health)
              const on = active === s.project_id
              return (
                <g key={s.project_id} className="cursor-pointer" onMouseEnter={() => setHover(s.project_id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(s)}>
                  <circle cx={cx} cy={cy} r={rad + 3} fill={color} opacity={0.1} />
                  <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity={on ? 0.55 : 0.32} stroke={color} strokeWidth={on ? 2.5 : 1.5} />
                  <text x={cx} y={cy - rad - 3} textAnchor="middle" className="fill-foreground text-[8px] font-semibold">{s.name}</text>
                </g>
              )
            })}
          </svg>
          <div className="absolute bottom-1.5 left-2 text-[9px] text-muted-foreground">cluster detail</div>
        </div>

        {hover && (() => {
          const s = geo.find((p) => p.project_id === hover)!
          return (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border bg-background px-3 py-2 text-[11px] shadow-xl">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <span className="size-2 rounded-full" style={{ background: healthColor(s.health) }} />
                {s.name}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>Health</span><span className="tnum text-right text-foreground">{s.health}</span>
                <span>Steel</span><span className="tnum text-right text-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
                <span>Wastage</span><span className="tnum text-right text-foreground">{s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}</span>
                <span>Exceptions</span><span className="tnum text-right text-foreground">{s.open_exceptions.toLocaleString("en-IN")}</span>
                <span>Risk</span><span className="text-right font-semibold capitalize" style={{ color: healthColor(s.health) }}>{s.risk}</span>
              </div>
            </div>
          )
        })()}
      </div>
      {noGeo.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="size-3.5" /> No coordinates yet: {noGeo.map((s) => s.name).join(", ")}
        </div>
      )}
    </div>
  )
}
