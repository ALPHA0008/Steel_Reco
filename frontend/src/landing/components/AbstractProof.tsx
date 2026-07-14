import { motion } from "motion/react"
import { CountUp } from "./CountUp"

function Term({ label, value, unit, delay }: { label: string; value: number; unit: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay, duration: 0.5, ease: [0.2, 0, 0, 1] }}
      className="rounded-2xl border border-border/80 bg-gradient-to-b from-white to-background px-6 py-5 text-center shadow-[0_4px_16px_rgba(20,20,22,0.06),0_1px_3px_rgba(20,20,22,0.04)]"
    >
      <p className="font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="tnum font-display mt-2 text-[28px] font-semibold tracking-tight text-foreground">
        {value.toFixed(2)}
        <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">{unit}</span>
      </p>
    </motion.div>
  )
}

function Operator({ symbol, delay }: { symbol: string; delay: number }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.3 }}
      className="font-display shrink-0 text-3xl text-muted-foreground/35"
      aria-hidden
    >
      {symbol}
    </motion.span>
  )
}

/**
 * The abstract's most-argued-over figure, shown as a resolving equation
 * instead of a screenshot or a data feed: the two real ledger totals, live,
 * settling into the derived wastage percentage.
 */
export function AbstractProof() {
  return (
    <div className="rounded-3xl border border-border/80 bg-gradient-to-b from-white to-background p-8 shadow-[0_40px_80px_rgba(20,20,22,0.12),0_4px_12px_rgba(20,20,22,0.06)] sm:p-10">
      <p className="text-center text-[11.5px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        The number everyone argues over
      </p>

      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-4">
        <Term label="K · Total Physical" value={12.49} unit="T" delay={0} />
        <Operator symbol="÷" delay={0.35} />
        <Term label="D · Issued" value={302.7} unit="T" delay={0.5} />
        <Operator symbol="=" delay={0.85} />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 1.0, duration: 0.55, ease: [0.2, 0, 0, 1] }}
          className="rounded-2xl border border-danger-border bg-gradient-to-b from-danger-subtle to-white px-7 py-5 text-center shadow-[0_4px_16px_rgba(166,37,34,0.08),0_1px_3px_rgba(166,37,34,0.04)]"
        >
          <p className="font-mono text-[10.5px] font-semibold tracking-wide text-danger uppercase">M · Wastage</p>
          <p className="font-display mt-2 text-[34px] font-semibold tracking-tight text-danger">
            <CountUp to={4.97} decimals={2} />
            <span className="text-[16px]">%</span>
          </p>
          <span className="mt-1 inline-block text-[10.5px] font-semibold text-danger">▲ over 3% cap</span>
        </motion.div>
      </div>

      <p className="mx-auto mt-8 max-w-sm text-center text-[13.5px] leading-relaxed text-muted-foreground">
        No formula to break and no cell to overwrite. It recalculates the moment a GRN or issue posts.
      </p>
    </div>
  )
}
