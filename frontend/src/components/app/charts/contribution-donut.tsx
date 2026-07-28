import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Building2, Pause, Play } from "lucide-react"
import { Cell, Pie, PieChart } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { siteImage } from "@/lib/site-images"
import { cn } from "@/lib/utils"
import type { AnalyticsParetoRow, AnalyticsSite } from "@/lib/types"

/**
 * Six categorical slots, keyed to a SITE and not to its rank. Cross-filtering
 * reorders these lists constantly and the ranking differs per tab -- Grava is
 * 4th on wastage and 1st on exceptions -- so colouring by position would repaint
 * every surviving slice and quietly reassign identity mid-read.
 *
 * Values live in index.css (--series-1..6, re-picked per theme) and are
 * validated for lightness band, chroma floor, CVD separation, normal-vision
 * separation and contrast. Six is the cap: a seventh site folds into "Other"
 * rather than getting a generated hue, which under colour-vision deficiency
 * would be indistinguishable from one already on screen.
 */
const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const

const config = {} satisfies ChartConfig

/** How long each site holds the spotlight. Long enough to read three figures
 *  without feeling parked -- shorter and the numbers flick past unread. */
const DWELL_MS = 4600

/** The app's standard strong ease-out. Built-in `ease-out` is too weak to read
 *  as intentional at this size. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const

export type ContributionUnit = "MT" | "count"

function formatValue(v: number, unit: ContributionUnit): string {
  return unit === "count"
    ? `${v.toLocaleString("en-IN")} flags`
    : `${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`
}

/** The donut's centre already says what is being counted, so it doesn't repeat
 *  the noun -- "3,084 flags" under a heading reading "Open flags" is clumsy. */
function formatTotal(v: number, unit: ContributionUnit): string {
  return unit === "count"
    ? v.toLocaleString("en-IN")
    : `${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`
}

/**
 * Share of a portfolio total by site: a donut paired with a spotlight that
 * cycles the sites, and the two stay locked together.
 *
 * Whichever site the spotlight is showing is the slice that lifts out of the
 * donut, and pointing at a slice pulls that site into the spotlight. So the
 * chart can be read two ways -- watch it, or drive it -- and both answer the
 * same question.
 *
 * The figures moved off a six-row table and into the spotlight rather than being
 * dropped. They still matter: real shares here include 9.7% against 9.6% (APAS
 * vs Grava on wastage), a pair nobody can rank from two arcs. Reading close
 * values off a pie is the classic failure of the form, so the numbers are what
 * keep it honest -- and the cumulative figure preserves the Pareto reading ("two
 * sites are 73% of it") that the ranked bars used to carry.
 *
 * The chip rail underneath is doing two jobs at once: it navigates the
 * spotlight, and it is the legend. Without it the donut would carry identity by
 * colour alone.
 */
export function ContributionDonut({
  rows,
  allSites,
  unit,
  totalLabel,
  activeId,
  onToggleFilter,
}: {
  rows: AnalyticsParetoRow[]
  allSites: AnalyticsSite[]
  unit: ContributionUnit
  totalLabel: string
  activeId?: string | null
  onToggleFilter?: (s: AnalyticsSite) => void
}) {
  const reduceMotion = useReducedMotion()

  const { slices, total } = useMemo(() => {
    // Colour index comes from the site's stable position in the full site list,
    // so a site keeps its hue however this list is sorted or filtered.
    const orderOf = new Map(allSites.map((s, i) => [s.name, i]))
    const sum = rows.reduce((a, r) => a + r.value, 0)
    return {
      total: sum,
      slices: rows.map((r, rank) => {
        const site = allSites.find((s) => s.name === r.name)
        return {
          name: r.name,
          rank: rank + 1,
          value: r.value,
          cumulative: r.cumulative_pct,
          share: sum > 0 ? (r.value / sum) * 100 : 0,
          fill: SERIES[(orderOf.get(r.name) ?? 0) % SERIES.length],
          image: siteImage(r.name),
          location: site?.location ?? null,
          site,
          id: site?.project_id ?? r.name,
        }
      }),
    }
  }, [rows, allSites])

  const [index, setIndex] = useState(0)
  // Autoplay stops for good once the reader takes over -- a carousel that keeps
  // yanking the view away after you have chosen a site is hostile.
  const [surrendered, setSurrendered] = useState(false)
  const [hovering, setHovering] = useState(false)

  // Reduced motion means no unprompted movement at all: the spotlight holds the
  // leading site and waits to be driven.
  const playing = !reduceMotion && !surrendered && !hovering && slices.length > 1

  // Keep the index in range when the tab switches and the row count changes.
  useEffect(() => {
    setIndex((i) => (i < slices.length ? i : 0))
  }, [slices.length])

  // A filter applied anywhere on the dashboard pulls that site into the
  // spotlight, so the panel agrees with the rest of the page.
  useEffect(() => {
    if (!activeId) return
    const i = slices.findIndex((s) => s.id === activeId)
    if (i >= 0) {
      setIndex(i)
      setSurrendered(true)
    }
  }, [activeId, slices])

  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % slices.length), DWELL_MS)
    return () => window.clearInterval(t)
  }, [playing, slices.length])

  const focus = useCallback(
    (i: number, { takeOver = true }: { takeOver?: boolean } = {}) => {
      setIndex(i)
      if (takeOver) setSurrendered(true)
    },
    [],
  )

  const active = slices[Math.min(index, slices.length - 1)]
  const railRef = useRef<HTMLDivElement>(null)

  // Arrow keys move the spotlight when the rail has focus.
  const onRailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % slices.length
        : (index - 1 + slices.length) % slices.length
    focus(next)
    const btns = railRef.current?.querySelectorAll<HTMLButtonElement>("button[data-chip]")
    btns?.[next]?.focus()
  }

  if (!active) return null

  return (
    <div
      className="@container"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Capped and centred rather than filling the panel. Left to stretch, the
          spotlight became a ~1000px letterbox and object-cover threw away most
          of each photograph's height to fill it. */}
      <div className="mx-auto flex max-w-[860px] flex-col items-center gap-6 @3xl:flex-row @3xl:items-stretch @3xl:gap-7">
        {/* ---- Donut ---- */}
        <div className="relative shrink-0 self-center">
          <ChartContainer config={config} className="aspect-square h-[212px] w-[212px]">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={64}
                outerRadius={96}
                // The spotlit slice lifts out of the ring. Recharts animates
                // between radii, so this reads as a rise rather than a jump.
                activeIndex={index}
                activeShape={{ outerRadius: 105 }}
                // 2px of surface between segments: the boundary reads as a
                // boundary without a stroke calling attention to itself.
                paddingAngle={1.5}
                strokeWidth={0}
                isAnimationActive={!reduceMotion}
                animationDuration={260}
              >
                {slices.map((s, i) => (
                  <Cell
                    key={s.id}
                    fill={s.fill}
                    // Everything but the spotlit slice recedes. 0.4 rather than
                    // something lower: at 0.26 the rest of the ring washed out
                    // almost to the card colour, and a donut whose other slices
                    // have faded away has stopped showing part-to-whole.
                    fillOpacity={i === index ? 1 : 0.4}
                    className="cursor-pointer"
                    onMouseEnter={() => focus(i)}
                    onClick={() => s.site && onToggleFilter?.(s.site)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>

          {/* The hole holds the portfolio total: the chart answers "how much in
              all?" as well as "who drives it". */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
              {totalLabel}
            </span>
            <span className="tnum font-display text-[23px] leading-tight font-semibold">
              {formatTotal(total, unit)}
            </span>
            <span className="text-[10.5px] text-muted-foreground">{slices.length} sites</span>
          </div>
        </div>

        {/* ---- Spotlight ---- */}
        <button
          type="button"
          onClick={() => active.site && onToggleFilter?.(active.site)}
          className={cn(
            // Taller than the donut on purpose: the frosted panel needs its
            // rows, and at 212px it ate more than half the photograph. The donut
            // self-centres beside it.
            //
            // flex-1 is gated to the side-by-side breakpoint. In the stacked
            // layout the container is flex-col, where flex-1 resolves to
            // flex-basis:0% on the HEIGHT -- it overrode the explicit height and
            // collapsed the whole card to a hairline on mobile.
            "group relative h-[212px] w-full min-w-0 overflow-hidden rounded-2xl text-left @3xl:h-[244px] @3xl:flex-1",
            "border border-border/60 bg-muted",
            "transition-transform duration-150 ease-out active:scale-[0.995]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
          aria-label={`${active.name}: ${active.share.toFixed(1)}% of ${totalLabel.toLowerCase()}. Click to filter the dashboard to this site.`}
        >
          {/* One layer per site, crossfaded. A touch of blur on the way in and
              out bridges the two frames -- without it you see two distinct
              photographs overlapping rather than one changing. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={active.id}
              className="absolute inset-0"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02, filter: "blur(6px)" }}
              transition={{ duration: reduceMotion ? 0.2 : 0.44, ease: EASE_OUT }}
            >
              {active.image ? (
                <img
                  src={active.image}
                  alt=""
                  className="h-full w-full object-cover"
                  decoding="async"
                />
              ) : (
                // Test Project has no photograph -- it is the synthetic
                // proof-of-concept site. A tinted panel in its own series colour
                // keeps the spotlight consistent instead of showing a gap.
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${active.fill}, color-mix(in oklab, ${active.fill} 55%, black))` }}
                >
                  <Building2 className="size-9 text-white/30" strokeWidth={1.5} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* A light wash for depth, nothing more. The heavy two-layer scrim
              this replaced was doing the frosted panel's job as well, and its
              mid-stop showed up as a dark band straight across the photograph. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

          {/* Figures. Keyed to the site so they re-enter with it, staggered just
              enough to read as one movement rather than four. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              // The figures sit on their own frosted panel rather than straight
              // on the gradient. Some of these site renders are marketing
              // collateral with the project name and report titles baked into
              // the artwork -- Grava's is a report cover -- and no gradient
              // alone keeps a 26px number legible over that. A blurred, tinted
              // panel separates overlay from photograph whatever the photograph
              // happens to be, which is the only version of this that holds for
              // images nobody has vetted.
              className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/45 p-4 backdrop-blur-md @sm:p-5"
              initial="hidden"
              animate="shown"
              exit="hidden"
              variants={{
                hidden: {},
                shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.04 } },
              }}
            >
              {[
                <div key="name" className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] font-semibold text-white">
                    {active.name}
                  </span>
                  <span className="tnum shrink-0 font-display text-[26px] leading-none font-semibold text-white">
                    {active.share.toFixed(1)}%
                  </span>
                </div>,
                <div key="meta" className="mt-0.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[11.5px] text-white/70">
                    {active.location ?? "Synthetic proof-of-concept site"}
                  </span>
                  <span className="tnum shrink-0 text-[12px] font-medium text-white/85">
                    {formatValue(active.value, unit)}
                  </span>
                </div>,
                // Cumulative-to-here: the Pareto reading, kept as a track so
                // "these sites are most of it" is visible without arithmetic.
                // Inline rather than label-above-bar -- stacked, this row alone
                // pushed the panel over half the card.
                <div key="cum" className="mt-2.5 flex items-center gap-2.5">
                  <span className="shrink-0 text-[10.5px] whitespace-nowrap text-white/65">
                    Top {active.rank} together
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                    <motion.div
                      className="h-full rounded-full bg-white/85"
                      initial={{ width: 0 }}
                      animate={{ width: `${active.cumulative}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE_OUT }}
                    />
                  </div>
                  <span className="tnum shrink-0 text-[10.5px] font-medium text-white/85">
                    {active.cumulative.toFixed(0)}%
                  </span>
                </div>,
              ].map((child) => (
                <motion.div
                  key={child.key}
                  variants={{
                    hidden: { opacity: 0, y: reduceMotion ? 0 : 6 },
                    shown: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT } },
                  }}
                >
                  {child}
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Autoplay state, shown only while it is actually cycling. Reads as
              information, not a control -- the whole card is the control. */}
          {slices.length > 1 && (
            <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur-sm">
              {playing ? (
                <Play className="size-3 translate-x-px" strokeWidth={2.5} />
              ) : (
                <Pause className="size-3" strokeWidth={2.5} />
              )}
            </span>
          )}

          {/* Dwell progress: restarted per site by the key, and only present
              while cycling so a paused card has no crawling bar. */}
          {playing && (
            <motion.div
              key={`${active.id}-progress`}
              className="absolute inset-x-0 top-0 h-[2px] origin-left bg-white/70"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: DWELL_MS / 1000, ease: "linear" }}
            />
          )}
        </button>
      </div>

      {/* ---- Chip rail: legend and navigation in one ---- */}
      <div
        ref={railRef}
        role="tablist"
        aria-label="Sites by contribution"
        onKeyDown={onRailKeyDown}
        className="mt-5 flex flex-wrap items-center gap-1.5"
      >
        {slices.map((s, i) => {
          const isActive = i === index
          return (
            <button
              key={s.id}
              data-chip
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => focus(i)}
              onMouseEnter={() => focus(i)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium",
                "transition-[background-color,border-color,color] duration-150 ease-out",
                "active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive
                  ? "border-foreground/15 bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full transition-transform duration-150 ease-out",
                  isActive && "scale-125",
                )}
                style={{ background: s.fill }}
              />
              <span className="max-w-[13ch] truncate @lg:max-w-none">{s.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
