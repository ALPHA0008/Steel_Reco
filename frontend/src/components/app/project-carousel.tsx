import { useCallback, useEffect, useRef, useState } from "react"
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react"
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
 *
 * Cards get real depth: a cursor-tracked 3D tilt (spring-smoothed, not
 * instant), a light sweep that follows the same tilt, and a staggered
 * scale+blur entrance. This is an occasional executive-browsing view (not a
 * 100x/day action), so the heavier motion is earned here per the
 * frequency/purpose framework — everywhere else in the app stays crisp.
 */
export function ProjectCarousel({
  sites,
  onOpen,
}: {
  sites: AnalyticsSite[]
  onOpen: (s: AnalyticsSite) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  // Which directions still have content. Drives both the arrow disabled states
  // and the edge fades: without them the last card just looked clipped, as
  // though the layout were broken, rather than "there is more to the right".
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const syncEdges = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const first = el.firstElementChild
    const last = el.lastElementChild
    if (!first || !last) {
      setAtStart(true)
      setAtEnd(true)
      return
    }
    // Measured as "is the first/last card fully in view?" rather than from
    // scrollLeft. With snap-mandatory plus the track's own gap and padding the
    // resting scrollLeft is never 0 (it sits at 16px here), so a
    // `scrollLeft <= 1` test reported "not at the start" the moment the page
    // loaded and left the back arrow enabled with nowhere to go. Comparing
    // rects is immune to whatever padding, gap or snap alignment the track uses.
    const track = el.getBoundingClientRect()
    setAtStart(first.getBoundingClientRect().left >= track.left - 1)
    setAtEnd(last.getBoundingClientRect().right <= track.right + 1)
  }, [])

  useEffect(() => {
    syncEdges()
    const el = trackRef.current
    if (!el) return
    // Also re-check on resize: a card can stop being clipped when the window
    // widens, at which point the arrows and fades should disappear.
    const ro = new ResizeObserver(syncEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncEdges, sites.length])

  const scrollBy = (dx: number) => trackRef.current?.scrollBy({ left: dx, behavior: "smooth" })
  const scrollable = !(atStart && atEnd)

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your sites</h2>
        {/* Hidden entirely when everything already fits -- controls that can't
            do anything are worse than no controls. */}
        {scrollable && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Scroll to previous sites"
              disabled={atStart}
              onClick={() => scrollBy(-340)}
              className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll to more sites"
              disabled={atEnd}
              onClick={() => scrollBy(340)}
              className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          onScroll={syncEdges}
          className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
          style={{ scrollbarWidth: "none", perspective: 1200 }}
        >
          {sites.map((s, i) => (
            <SiteCard key={s.project_id} site={s} index={i} onOpen={onOpen} reduce={!!reduce} />
          ))}
        </div>

        {/* Edge fades, pointer-events-none so they never block a card click.
            They read as "the row continues" instead of a cut-off card. */}
        {!atStart && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent"
          />
        )}
        {!atEnd && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>
    </div>
  )
}

function SiteCard({
  site: s,
  index,
  onOpen,
  reduce,
}: {
  site: AnalyticsSite
  index: number
  onOpen: (s: AnalyticsSite) => void
  reduce: boolean
}) {
  const img = siteImage(s.name)

  // Raw pointer position within the card, normalized to -0.5..0.5.
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  // Spring-smoothed so the tilt "catches up" to the cursor rather than
  // snapping — a snappy, non-oscillating spring (bounce: 0).
  const springX = useSpring(px, { stiffness: 300, damping: 30, bounce: 0 })
  const springY = useSpring(py, { stiffness: 300, damping: 30, bounce: 0 })

  const rotateX = useTransform(springY, [-0.5, 0.5], ["9deg", "-9deg"])
  const rotateY = useTransform(springX, [-0.5, 0.5], ["-9deg", "9deg"])
  // Image floats slightly forward of the card plane for real parallax depth.
  const imgX = useTransform(springX, [-0.5, 0.5], [-8, 8])
  const imgY = useTransform(springY, [-0.5, 0.5], [-8, 8])
  // The light sweep follows the cursor as a percentage position for the
  // radial-gradient glare layer below.
  const glareX = useTransform(springX, [-0.5, 0.5], ["0%", "100%"])
  const glareY = useTransform(springY, [-0.5, 0.5], ["0%", "100%"])

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (reduce) return
    const rect = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width - 0.5)
    py.set((e.clientY - rect.top) / rect.height - 0.5)
  }
  function handleMouseLeave() {
    px.set(0)
    py.set(0)
  }

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(s)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={reduce ? false : { opacity: 0, scale: 0.9, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      // amount was 0.4, which required 40% of a card to be visible vertically.
      // On a 900px-tall window the row lands ~38% in view, just under the
      // threshold -- so with `once: true` the cards stayed at opacity 0 and the
      // section looked empty until you happened to scroll. An entrance
      // animation must never be the reason content is missing: a small amount
      // plus a bottom margin starts it just before the row is reached.
      viewport={{ once: true, amount: 0.1, margin: "0px 0px 120px 0px" }}
      transition={{ duration: 0.55, delay: Math.min(index, 6) * 0.07, ease: [0.23, 1, 0.32, 1] }}
      whileTap={{ scale: 0.97 }}
      style={{
        rotateX: reduce ? 0 : rotateX,
        rotateY: reduce ? 0 : rotateY,
        transformStyle: "preserve-3d",
      }}
      className="group relative aspect-[4/5] w-[240px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/50 text-left shadow-(--shadow-card) [@media(hover:hover)]:hover:shadow-[0_28px_60px_rgba(20,20,22,0.28)]"
    >
      {/* Image layer floats forward on its own plane for real parallax. */}
      <motion.div
        className="absolute inset-0 h-full w-full"
        style={{ x: reduce ? 0 : imgX, y: reduce ? 0 : imgY, scale: 1.08, transformStyle: "preserve-3d" }}
      >
        {img ? (
          <img
            src={img}
            alt={s.name}
            // The first two cards are above the fold, so they load eagerly and
            // get fetch priority; the rest wait until scrolled toward. Before
            // this, every site's hero competed on first paint and the last card
            // in the row (Grava) reliably lost.
            loading={index < 2 ? "eager" : "lazy"}
            fetchPriority={index < 2 ? "high" : "low"}
            decoding="async"
            // Intrinsic size prevents a reflow when the image lands, and tells
            // the browser it never needs more than the card's own width.
            width={240}
            height={300}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand to-[#7a0016]">
            <Building2 className="size-10 text-white/25" />
          </div>
        )}
      </motion.div>

      {/* gradient scrim for legible overlay text -- decorative, must not steal
          the pointer so the tilt handler (bound to the button) keeps tracking
          the cursor as it moves across this layer. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/0" />

      {/* Cursor-tracked light sweep — only meaningful with the tilt, so it's
          gated behind hover via opacity, not a permanent overlay. */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100"
          style={{
            background: useTransformedGradient(glareX, glareY),
          }}
        />
      )}

      {/* top-right risk chip */}
      <span className={cn("absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm", RISK_TONE[s.risk])}>
        {s.risk}
      </span>

      {/* bottom content, lifted onto its own depth plane */}
      <div className="absolute inset-x-0 bottom-0 p-4" style={{ transform: "translateZ(30px)" }}>
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
    </motion.button>
  )
}

/** Builds a `radial-gradient(...)` string whose center follows the spring-
 * smoothed cursor position, as a MotionValue so it stays off the render
 * cycle (motion updates the style directly, no React re-render per frame). */
function useTransformedGradient(glareX: MotionValue<string>, glareY: MotionValue<string>) {
  return useTransform([glareX, glareY], ([gx, gy]: string[]) =>
    `radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.22), transparent 55%)`,
  )
}
