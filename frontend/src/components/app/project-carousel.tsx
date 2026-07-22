import { useRef } from "react"
import { Building2, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { siteImage } from "@/lib/site-images"
import type { AnalyticsSite } from "@/lib/types"

const RISK_TONE: Record<AnalyticsSite["risk"], string> = {
  low: "bg-success-subtle text-success",
  medium: "bg-info-subtle text-info",
  high: "bg-warning-subtle text-warning",
  critical: "bg-danger-subtle text-danger",
}

/**
 * Horizontal-scroll project gallery — each card carries the site's real hero
 * photo, with health/wastage overlaid, so an executive can browse sites the
 * way they'd browse listings, not a data table. Click a card to open that
 * site's own dashboard. Scroll-snap + arrow buttons (no external carousel lib).
 */
export function ProjectCarousel({
  sites,
  onOpen,
}: {
  sites: AnalyticsSite[]
  onOpen: (s: AnalyticsSite) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scrollBy = (dx: number) => trackRef.current?.scrollBy({ left: dx, behavior: "smooth" })

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your sites</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollBy(-340)}
            className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(340)}
            className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {sites.map((s) => {
          const img = siteImage(s.name)
          return (
            <button
              key={s.project_id}
              type="button"
              onClick={() => onOpen(s)}
              className="group relative aspect-[4/5] w-[240px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/50 text-left shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(20,20,22,0.16)]"
            >
              {img ? (
                <img
                  src={img}
                  alt={s.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand to-[#7a0016]">
                  <Building2 className="size-10 text-white/25" />
                </div>
              )}
              {/* gradient scrim for legible overlay text */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/0" />

              {/* top-right risk chip */}
              <span className={cn("absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm", RISK_TONE[s.risk])}>
                {s.risk}
              </span>

              {/* bottom content */}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="font-display text-[17px] font-semibold leading-tight text-white text-balance">{s.name}</div>
                {s.location && <div className="mb-2 truncate text-[11px] text-white/70">{s.location}</div>}
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[9.5px] font-semibold uppercase tracking-wide text-white/60">Wastage</div>
                    <div className={cn("tnum text-[19px] font-bold leading-none", s.over_cap ? "text-[#ff8a87]" : "text-[#7bf0a3]")}>
                      {s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9.5px] font-semibold uppercase tracking-wide text-white/60">Health</div>
                    <div className="tnum text-[19px] font-bold leading-none text-white">{s.health}</div>
                  </div>
                </div>
                {s.open_exceptions > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[10.5px] font-medium text-white/85">
                    <TriangleAlert className="size-3" /> {s.open_exceptions.toLocaleString("en-IN")} open flags
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
