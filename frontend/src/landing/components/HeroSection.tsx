import { Link } from "react-router-dom"
import { motion, type Variants } from "motion/react"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { HeroBackground } from "./HeroBackground"

const TITLE = "Niṣṭhā"

// Container staggers its children; each rises and un-blurs into place.
const container: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.2, 0, 0, 1] } },
}
const letter: Variants = {
  hidden: { opacity: 0, y: 40, filter: "blur(12px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.2, 0, 0, 1] } },
}

export function HeroSection() {
  const { user } = useAuth()
  const ctaTo = user ? "/dashboard" : "/login"
  const ctaLabel = user ? "Open dashboard" : "Get Started"

  return (
    <section id="top" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white">
      <HeroBackground />

      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto flex max-w-[1100px] flex-col items-center px-6 pt-16 pb-24 text-center"
      >
        {/* Title — per-letter blur-rise reveal, precomposed glyphs in the display face. */}
        <h1
          className="font-display font-semibold leading-[0.92] tracking-[-0.035em] text-foreground text-[76px] sm:text-[104px] md:text-[136px]"
          aria-label={TITLE}
          style={{ fontFeatureSettings: '"liga" 1, "calt" 1' }}
        >
          {[...TITLE].map((ch, i) => (
            <motion.span key={i} variants={letter} className="inline-block">
              {ch}
            </motion.span>
          ))}
        </h1>

        <motion.p
          variants={rise}
          className="mt-7 text-[13px] font-semibold tracking-[0.32em] text-muted-foreground uppercase sm:text-[15px]"
        >
          Steel Reconciliation Tool
        </motion.p>

        <motion.div variants={rise} className="mt-12">
          <Link
            to={ctaTo}
            className="group inline-flex h-[54px] items-center gap-2 rounded-full bg-brand px-9 text-[16px] font-semibold text-brand-foreground shadow-lg shadow-brand/20 transition-all hover:bg-brand-hover hover:shadow-xl hover:shadow-brand/25"
          >
            {ctaLabel}
            <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="grid size-9 place-items-center rounded-full border border-border bg-white/70 text-muted-foreground backdrop-blur"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  )
}
