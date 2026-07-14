import { useEffect, useRef } from "react"
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react"

/** Count-up that runs once, when the element scrolls into view. */
export function CountUp({ to, decimals = 2, className }: { to: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => v.toFixed(decimals))
  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, to, { duration: 1.4, ease: [0.2, 0, 0, 1] })
    return () => controls.stop()
  }, [inView, to, mv])
  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  )
}
