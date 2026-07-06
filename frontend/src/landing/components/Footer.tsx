import { ArrowUpRight, Globe, Linkedin, Mail } from "lucide-react"
import { Link } from "react-router-dom"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"
import { useScrollTo } from "../lib/smooth-scroll"

// Mirrors the MEDHA footer: a brand block, a "modules" column with arrow links,
// a product column, and a connect column, over a left-aligned copyright bar.
const MODULES = [
  { label: "Steel Abstract", to: "/login" },
  { label: "Exceptions Inbox", to: "/login" },
  { label: "GRN & Issues", to: "/login" },
]
const PRODUCT = [
  { label: "How it works", href: "#walkthrough" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
]

export function Footer() {
  const scrollTo = useScrollTo()

  return (
    <footer id="contact" className="relative bg-foreground text-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.7fr_1fr_1fr_1fr]">
          {/* Brand block */}
          <div>
            <div className="flex items-center gap-2.5">
              <Logo />
              <Wordmark className="text-[20px] text-white" />
            </div>
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-white/50">
              Niṣṭhā accounts for every kilogram of steel across My Home Constructions sites, from the weighbridge to
              the month-end abstract. Built for internal use by My Home Group.
            </p>
          </div>

          {/* Modules */}
          <div>
            <h4 className="mb-4 text-[11px] font-semibold tracking-[0.14em] text-white/40 uppercase">Modules</h4>
            <ul className="space-y-3">
              {MODULES.map((m) => (
                <li key={m.label}>
                  <Link
                    to={m.to}
                    className="group inline-flex items-center gap-1 text-[14px] text-white/60 transition-colors hover:text-white"
                  >
                    {m.label}
                    <ArrowUpRight className="size-3.5 text-white/30 transition-colors group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-[11px] font-semibold tracking-[0.14em] text-white/40 uppercase">Product</h4>
            <ul className="space-y-3">
              {PRODUCT.map((p) => (
                <li key={p.label}>
                  <button
                    onClick={() => scrollTo(p.href)}
                    className="text-left text-[14px] text-white/60 transition-colors hover:text-white"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="mb-4 text-[11px] font-semibold tracking-[0.14em] text-white/40 uppercase">Connect</h4>
            <a
              href="https://www.myhomeconstructions.com"
              target="_blank"
              rel="noreferrer"
              className="text-[14px] text-white/60 transition-colors hover:text-white"
            >
              Get in touch
            </a>
            <div className="mt-4 flex items-center gap-2.5">
              {[
                { Icon: Linkedin, href: "https://www.linkedin.com/company/my-home-group", label: "LinkedIn" },
                { Icon: Globe, href: "https://www.myhomeconstructions.com", label: "Website" },
                { Icon: Mail, href: "mailto:it@myhomeconstructions.com", label: "Email" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  aria-label={label}
                  className="grid size-9 place-items-center rounded-lg bg-white/[0.06] text-white/60 transition-colors hover:bg-brand hover:text-white"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-white/10 pt-6 text-[12.5px] text-white/40">
          &copy; {new Date().getFullYear()} My Home Group · My Home Constructions. Internal steel tooling.
        </div>
      </div>
    </footer>
  )
}
