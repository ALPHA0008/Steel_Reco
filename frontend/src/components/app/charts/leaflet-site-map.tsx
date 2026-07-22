import { useEffect, useMemo } from "react"
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet"
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

/** Recenters/refits the map whenever the site set changes (e.g. first load). */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 13)
    } else {
      map.fitBounds(points, { padding: [36, 36], maxZoom: 14 })
    }
  }, [map, points])
  return null
}

/**
 * Real interactive map (OpenStreetMap tiles via Leaflet — no API key, no
 * billing). Every site plotted at its true lat/long; circle radius = steel
 * volume, color = health band. Popups carry the same operational figures the
 * old placeholder card did. Click a marker (or its popup) to cross-filter the
 * whole dashboard. Pan/zoom/scroll are native Leaflet — this is a genuine map,
 * not a stylised drawing.
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

  const radiusPx = (vol: number) => 10 + (vol / maxVol) * 16

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-border/60" style={{ height }}>
        <MapContainer
          center={points[0]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          className="[&_.leaflet-control-attribution]:text-[9px]"
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
              <CircleMarker
                key={s.project_id}
                center={[s.latitude as number, s.longitude as number]}
                radius={radiusPx(s.received_mt)}
                pathOptions={{
                  color,
                  weight: active ? 3 : 1.75,
                  fillColor: color,
                  fillOpacity: active ? 0.55 : 0.32,
                }}
                eventHandlers={{ click: () => onOpen?.(s) }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1} className="!rounded-lg !border !border-border !bg-background !px-2.5 !py-1.5 !text-[11px] !shadow-lg">
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
              </CircleMarker>
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
