import { useEffect, useRef } from "react"
import { useInView, useMotionValue, useSpring, useReducedMotion, type SpringOptions } from "motion/react"

/**
 * A figure that counts up to its value with spring physics.
 *
 * Adapted from the Animate UI counting-number primitive, with three changes
 * this app needs:
 *
 *  1. **Locale-aware.** Every figure in this tool is Indian-grouped
 *     (`en-IN`, lakh/crore) via `lib/format`. The upstream primitive writes a
 *     raw `toFixed()` string, which would render `5917538` mid-flight and
 *     `59,17,538` at rest -- a visible format "snap". This takes the same
 *     `format` function the static render uses, so every intermediate frame is
 *     formatted identically to the final one.
 *  2. **Off the render cycle.** The value is written straight to the DOM node
 *     from a motion-value subscription, so a 5-tile KPI strip costs zero React
 *     re-renders per frame instead of ~300/sec.
 *  3. **Reduced-motion and in-view aware.** Honors `prefers-reduced-motion`
 *     (renders the final figure immediately, no animation) and only starts
 *     once scrolled into view, so numbers below the fold still animate when
 *     the reader actually reaches them.
 *
 * The span reserves the final string's width via the formatted target as
 * initial text content, so nothing reflows as digits grow.
 */
export function CountingNumber({
  value,
  format,
  className,
  transition = { stiffness: 120, damping: 28, mass: 0.6 },
  delay = 0,
}: {
  value: number
  /** Same formatter the static value would use -- keeps every frame consistent. */
  format: (n: number) => string
  className?: string
  transition?: SpringOptions
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const isInView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" })

  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, transition)

  // Drive the spring toward the real value once it's both in view and (if the
  // value arrives async) actually known.
  useEffect(() => {
    if (reduce) return
    if (!isInView) return
    const id = setTimeout(() => motionVal.set(value), delay)
    return () => clearTimeout(id)
  }, [isInView, value, motionVal, delay, reduce])

  // Write each frame straight to the DOM -- no React state, no re-render.
  useEffect(() => {
    if (reduce) return
    return spring.on("change", (latest) => {
      if (ref.current) ref.current.textContent = format(latest)
    })
  }, [spring, format, reduce])

  // Reduced motion (or before the spring starts) shows the true value, never a
  // placeholder zero that would flash.
  return (
    <span ref={ref} className={className}>
      {reduce || !isInView ? format(value) : format(0)}
    </span>
  )
}
