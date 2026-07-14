import { motion } from "motion/react"
import { Check } from "lucide-react"
import { AbstractProof } from "./AbstractProof"

const POINTS = [
  { k: "A · Received", v: "summed from every GRN" },
  { k: "D · Issued", v: "summed from every issue row" },
  { k: "M · Wastage", v: "derived, then checked against the cap" },
]

export function AbstractShowcase() {
  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
        >
          <p className="text-[12px] font-semibold tracking-[0.16em] text-brand-text uppercase">The Steel Abstract</p>
          <h2 className="font-display mt-3 text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-[52px] md:leading-[1.05]">
            Every figure computed, none typed
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
            The month-end abstract is the number everyone argues over. Here it is read straight from the ledger, so
            there is nothing to key in and nothing to fudge.
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
        className="mx-auto mt-12 max-w-[760px] px-6"
      >
        <AbstractProof />
      </motion.div>

      <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6">
        {POINTS.map((p, i) => (
          <motion.li
            key={p.k}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.45, ease: [0.2, 0, 0, 1] }}
            className="flex items-center gap-2.5"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
              <Check className="size-3" strokeWidth={2.5} />
            </span>
            <span className="text-[13.5px] text-foreground">
              <span className="font-mono text-[12.5px] font-semibold text-brand-text">{p.k}</span>{" "}
              <span className="text-muted-foreground">{p.v}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}
