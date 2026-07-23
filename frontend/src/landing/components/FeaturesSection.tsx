import { motion, type Variants } from "motion/react"
import { FileCheck2, Lock, Scale, Scissors } from "lucide-react"
import { cn } from "@/lib/utils"
import { CountUp } from "./CountUp"

/* Exception chips that slide in on view — the "everything surfaces" idea, live. */
const EXCEPTIONS = [
  { dot: "bg-danger", label: "Weighbridge drift", meta: "0.42 T" },
  { dot: "bg-warning", label: "Wastage over cap", meta: "6.1%" },
  { dot: "bg-info", label: "GRN without a PO", meta: "flagged" },
]

const grid: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const tile: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0, 0, 1] } },
}

const tileBase =
  "group relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card to-background p-7 shadow-[0_4px_16px_rgba(20,20,22,0.06),0_1px_3px_rgba(20,20,22,0.04)] transition-[transform,border-color,box-shadow] duration-300 ease-out-strong [@media(hover:hover)]:hover:-translate-y-1.5 hover:border-brand-border hover:shadow-[0_24px_56px_rgba(20,20,22,0.12)]"

export function FeaturesSection() {
  return (
    <section id="features" className="relative bg-card py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-[52px] md:leading-[1.05]">
            What it does
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
            Everything here runs in the tool today. Nothing is a mockup.
          </p>
        </motion.div>

        <motion.div
          variants={grid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-6"
        >
          {/* Tile 1 — computed abstract, with a live count-up */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-4")}>
            <div className="flex h-full flex-col">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-brand-text uppercase">The Abstract</p>
              <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-foreground">
                It computes itself
              </h3>
              <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
                Sections A to N are a live query over the ledger, not a formula anyone can overwrite. No total is ever
                typed by hand.
              </p>
              <div className="mt-auto flex items-end gap-8 pt-8">
                <div>
                  <div className="font-display text-[40px] leading-none font-semibold text-foreground">
                    <CountUp to={312.48} />
                    <span className="ml-1 text-[18px] text-muted-foreground">T</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">Received, reconciled</p>
                </div>
                <div>
                  <div className="font-display text-[40px] leading-none font-semibold text-brand">
                    <CountUp to={4.97} />
                    <span className="text-[18px]">%</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">Wastage, computed</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Tile 2 — genuine sum */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-2")}>
            <span className="grid size-11 place-items-center rounded-xl bg-background text-info transition-[transform,background-color,color] duration-300 ease-out-strong group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-brand-subtle group-hover:text-brand">
              <Scale className="size-5" strokeWidth={1.8} />
            </span>
            <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] text-foreground">Issued is a real sum</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
              Steel issued is added up from actual issue rows, never copied from what came in.
            </p>
          </motion.div>

          {/* Tile 3 — upstream reconciliation */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-2")}>
            <span className="grid size-11 place-items-center rounded-xl bg-background text-info transition-[transform,background-color,color] duration-300 ease-out-strong group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-brand-subtle group-hover:text-brand">
              <FileCheck2 className="size-5" strokeWidth={1.8} />
            </span>
            <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] text-foreground">Upstream checks</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
              Every GRN is matched to its PO and supplier invoice. Drift gets flagged, not assumed away.
            </p>
          </motion.div>

          {/* Tile 4 — exceptions, with animated chips */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-4")}>
            <div className="flex h-full flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-sm">
                <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">Exceptions, not silence</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  Anything that does not reconcile lands in one inbox with a reason attached. Approve it, correct it, or
                  follow up. Nothing is quietly dropped.
                </p>
              </div>
              <div className="w-full max-w-[260px] shrink-0 space-y-2.5">
                {EXCEPTIONS.map((e, i) => (
                  <motion.div
                    key={e.label}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.12, duration: 0.5, ease: [0.2, 0, 0, 1] }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", e.dot)} />
                    <span className="text-[13px] font-medium text-foreground">{e.label}</span>
                    <span className="ml-auto font-mono text-[12px] tabular-nums text-muted-foreground">{e.meta}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Tile 5 — cut pieces */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-3")}>
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-info transition-[transform,background-color,color] duration-300 ease-out-strong group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-brand-subtle group-hover:text-brand">
                <Scissors className="size-5" strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">Cut pieces, classified</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  Pieces of 1.5m or less are scrap by rule, enforced in the database rather than left to memory.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Tile 6 — months lock */}
          <motion.div variants={tile} className={cn(tileBase, "md:col-span-3")}>
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-info transition-[transform,background-color,color] duration-300 ease-out-strong group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-brand-subtle group-hover:text-brand">
                <Lock className="size-5" strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">Months lock, with a trail</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  Finalizing snapshots and locks the period. Reopening needs a reason and keeps the prior snapshot.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
