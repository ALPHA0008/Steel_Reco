import { motion, useScroll, useSpring } from "motion/react"

/**
 * Top scroll-progress bar. Framer's useScroll gives 0→1 page progress;
 * useSpring smooths it so it glides continuously rather than stepping —
 * exactly the "synchronous with scroll, continuous and smooth" behaviour
 * the reference scroll-progress components (bundui / motion-primitives) use.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  })

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-brand via-brand to-[#ff5470]"
    />
  )
}
