import { motion, type Variants } from "motion/react"

const STEPS = [
  {
    num: "01",
    title: "Record as it happens",
    desc: "Enter each receipt, issue, transfer, and count on the day, not at month end.",
  },
  {
    num: "02",
    title: "Link the paperwork",
    desc: "Attach the PO and invoice where you have them. The tool checks the weights for you.",
  },
  {
    num: "03",
    title: "Clear the exceptions",
    desc: "Whatever does not reconcile shows up in one inbox. Approve, correct, or follow up.",
  },
  {
    num: "04",
    title: "Close the month",
    desc: "Finalize to snapshot and lock the abstract. Reopening always leaves a trail.",
  },
]

const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.2, 0, 0, 1], delay: i * 0.08 },
  }),
}

export function HowItWorks() {
  return (
    <section id="walkthrough" className="relative bg-card py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-[52px] md:leading-[1.05]">
            How it works
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
            Four steps, every month, on every site.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              custom={i}
              variants={item}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="group relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card to-background p-7 shadow-[0_4px_16px_rgba(20,20,22,0.06),0_1px_3px_rgba(20,20,22,0.04)] transition-[transform,border-color,box-shadow] duration-300 ease-out-strong [@media(hover:hover)]:hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(20,20,22,0.10)]"
            >
              <span className="font-display inline-block text-5xl font-semibold leading-none text-brand-subtle transition-[transform,color] duration-300 ease-out-strong group-hover:-translate-y-0.5 group-hover:text-brand/25">
                {step.num}
              </span>
              <h3 className="mt-4 text-[18px] font-semibold tracking-[-0.01em] text-foreground">{step.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
