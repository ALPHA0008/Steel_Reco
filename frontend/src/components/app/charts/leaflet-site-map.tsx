import { useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapPin } from "lucide-react"
import type { AnalyticsSite } from "@/lib/types"

function healthColor(h: number): string {
  if (h >= 75) return "#00652c" // --success
  if (h >= 55) return "#2a5a85" // --info
  if (h >= 35) return "#7f4b00" // --warning
  return "#a62522" // --danger
}
function healthLabel(h: number): string {
  if (h >= 75) return "Healthy"
  if (h >= 55) return "Stable"
  if (h >= 35) return "At risk"
  return "Critical"
}

/** A teardrop map pin as an SVG divIcon. Size scales with steel volume; the
 * head is filled with the health color, and a subtle ring pulses on the active
 * site. The pin's tip anchors exactly on the coordinate. */
function pinIcon(color: string, px: number, active: boolean): L.DivIcon {
  const w = px
  const h = Math.round(px * 1.32)
  const pulse = active
    ? `<circle cx="${w / 2}" cy="${w * 0.42}" r="${w * 0.5}" fill="${color}" opacity="0.25">
         <animate attributeName="r" values="${w * 0.42};${w * 0.66};${w * 0.42}" dur="1.8s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.3;0;0.3" dur="1.8s" repeatCount="indefinite"/>
       </circle>`
    : ""
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 40 53" xmlns="http://www.w3.org/2000/svg">
      ${pulse ? `<g transform="scale(${40 / w})">${pulse}</g>` : ""}
      <path d="M20 1.5C10.6 1.5 3 9.1 3 18.5c0 12 17 32 17 32s17-20 17-32C37 9.1 29.4 1.5 20 1.5Z"
            fill="${color}" stroke="white" stroke-width="2.5"/>
      <circle cx="20" cy="18.5" r="6.5" fill="white"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: "site-pin",
    iconSize: [w, h],
    iconAnchor: [w / 2, h], // tip of the teardrop
    tooltipAnchor: [0, -h + 6],
  })
}

/** Recenters/refits the map whenever the site set changes (e.g. first load). */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 13)
    } else {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 15 })
    }
  }, [map, points])
  return null
}

/**
 * Real interactive map (OpenStreetMap tiles via Leaflet — no API key, no
 * billing). Every site plotted at its true lat/long as a teardrop pin whose
 * size = steel volume and color = health band. Popups carry the operational
 * figures. Click a pin to cross-filter the whole dashboard. Pan/zoom/scroll
 * are native Leaflet.
 */
export function LeafletSiteMap({
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
  const geo = useMemo(() => sites.filter((s) => s.latitude != null && s.longitude != null), [sites])
  const noGeo = sites.filter((s) => s.latitude == null || s.longitude == null)
  const maxVol = Math.max(1, ...geo.map((s) => s.received_mt))
  const points = useMemo<[number, number][]>(() => geo.map((s) => [s.latitude as number, s.longitude as number]), [geo])

  if (geo.length === 0) {
    return <div className="py-10 text-center text-[13px] text-muted-foreground">No site coordinates available.</div>
  }

  const pinPx = (vol: number) => 22 + (vol / maxVol) * 10

  return (
    <div>
      {/* isolate: contain Leaflet's internal pane z-indexes (200–700) inside a
          new stacking context so they can't punch through overlays like the
          site drawer (Radix Sheet content sits at z-50). */}
      <div className="relative z-0 overflow-hidden rounded-2xl border border-border/60 [isolation:isolate]" style={{ height }}>
        <MapContainer
          center={points[0]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          className="[&_.leaflet-control-attribution]:text-[9px] [&_.site-pin]:!bg-transparent"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {geo.map((s) => {
            const color = healthColor(s.health)
            const active = activeId === s.project_id
            return (
              <Marker
                key={s.project_id}
                position={[s.latitude as number, s.longitude as number]}
                icon={pinIcon(color, pinPx(s.received_mt), active)}
                zIndexOffset={active ? 1000 : 0}
                eventHandlers={{ click: () => onOpen?.(s) }}
              >
                <Tooltip direction="top" opacity={1} className="!rounded-lg !border !border-border !bg-background !px-2.5 !py-1.5 !text-[11px] !shadow-lg">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    {s.name}
                    <span className="ml-1 font-normal text-muted-foreground">· {healthLabel(s.health)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>Steel</span><span className="text-right font-medium text-foreground">{s.received_mt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT</span>
                    <span>Wastage</span><span className="text-right font-medium text-foreground">{s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}</span>
                    <span>Exceptions</span><span className="text-right font-medium text-foreground">{s.open_exceptions.toLocaleString("en-IN")}</span>
                  </div>
                </Tooltip>
              </Marker>
            )
          })}
        </MapContainer>
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
