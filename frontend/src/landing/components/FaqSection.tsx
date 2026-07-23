import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const FAQS = [
  {
    q: "Does this replace Excel?",
    a: "For the abstract and the ledger, yes. Sections A to N are computed from what you enter, never typed. Backfilling a project's older history from legacy sheets is a separate effort.",
  },
  {
    q: "What if I do not have a Purchase Order yet?",
    a: "Record the GRN anyway. It is flagged as unreconciled in Exceptions instead of blocked, so you are never stopped from working.",
  },
  {
    q: "Who can see my project's data?",
    a: "Only people assigned to that project. Isolation is enforced in the database, not just the app, so no one can reach another project's data even by guessing an ID.",
  },
  {
    q: "What if I enter something wrong?",
    a: "Corrections are new entries, so the original stays on record. A closed month can be reopened with a reason, corrected, and closed again, and the prior snapshot is kept.",
  },
  {
    q: "Why flag things instead of fixing them?",
    a: "Most rules start out advisory. They record an exception with a reason rather than block you, and only become blocking once they hold up across a few clean months.",
  },
]

export function FaqSection() {
  // Default closed — nothing auto-expands on load/reload.
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="relative bg-card py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
          className="text-center"
        >
          <h2 className="font-display text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-5xl">
            Frequently asked
          </h2>
        </motion.div>

        <div className="mt-12 space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i
            return (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: [0.2, 0, 0, 1] }}
                className={cn(
                  "overflow-hidden rounded-2xl border transition-[background-color,box-shadow,border-color] duration-300 ease-out-strong",
                  isOpen
                    ? "border-brand-border bg-brand-subtle shadow-[0_4px_16px_rgba(215,0,40,0.08)]"
                    : "border-border bg-card shadow-[0_1px_3px_rgba(20,20,22,0.04)] hover:border-input hover:shadow-[0_4px_12px_rgba(20,20,22,0.06)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-[16px] font-semibold text-foreground"
                  aria-expanded={isOpen}
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180 text-brand",
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-brand-border px-6 py-5 text-[15px] leading-relaxed text-muted-foreground">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
