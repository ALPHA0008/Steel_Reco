import { motion } from "motion/react"
import { Check } from "lucide-react"
import { AbstractMockup } from "./AbstractMockup"

const POINTS = [
  { k: "A · Received", v: "summed from every GRN" },
  { k: "D · Issued", v: "summed from every issue row" },
  { k: "M · Wastage", v: "derived, then checked against the cap" },
]

export function AbstractShowcase() {
  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Left — the claim, made concrete */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
        >
          <p className="text-[12px] font-semibold tracking-[0.16em] text-brand-text uppercase">The Steel Abstract</p>
          <h2 className="font-display mt-3 text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-[46px] md:leading-[1.05]">
            Every figure computed, none typed
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
            The month-end abstract is the number everyone argues over. Here it is read straight from the ledger, so
            there is nothing to key in and nothing to fudge.
          </p>

          <ul className="mt-8 space-y-3.5">
            {POINTS.map((p, i) => (
              <motion.li
                key={p.k}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.2, 0, 0, 1] }}
                className="flex items-center gap-3"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                <span className="text-[14.5px] text-foreground">
                  <span className="font-mono text-[13px] font-semibold text-brand-text">{p.k}</span>{" "}
                  <span className="text-muted-foreground">{p.v}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* Right — the actual grid in an app-window frame, with a live callout */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
          className="relative"
        >
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_rgba(20,20,22,0.14)] ring-1 ring-border">
            {/* window chrome */}
            <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
              <span className="size-2.5 rounded-full bg-[#e7e5e6]" />
              <span className="size-2.5 rounded-full bg-[#e7e5e6]" />
              <span className="size-2.5 rounded-full bg-[#e7e5e6]" />
              <span className="ml-3 text-[12px] font-medium text-muted-foreground">Niṣṭhā · Abstract</span>
            </div>
            <div className="p-3 sm:p-4">
              <AbstractMockup />
            </div>
          </div>

          {/* floating "computed live" callout */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.2, 0, 0, 1] }}
            className="absolute -bottom-4 -right-2 hidden items-center gap-2 rounded-full border border-brand-border bg-white px-4 py-2 shadow-[0_10px_30px_rgba(215,0,40,0.15)] sm:flex"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            <span className="text-[12.5px] font-semibold text-foreground">Computed live from the ledger</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
