import { useRef } from "react"
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
        style={{ scrollbarWidth: "none", perspective: 1200 }}
      >
        {sites.map((s, i) => (
          <SiteCard key={s.project_id} site={s} index={i} onOpen={onOpen} reduce={!!reduce} />
        ))}
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
      viewport={{ once: true, amount: 0.4 }}
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
          <img src={img} alt={s.name} className="h-full w-full object-cover" />
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
