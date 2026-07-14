import type { CSSProperties } from "react"
import { ArrowUpRight, Instagram, Linkedin } from "lucide-react"
import { Link } from "react-router-dom"
import { Logo, LogoMark } from "./Logo"
import { Wordmark } from "./Wordmark"
import { useScrollTo } from "../lib/smooth-scroll"

const SOCIAL_LINKS: { label: string; href: string; Icon: typeof Instagram; className: string; style?: CSSProperties }[] = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/myhomeconstructions_?igsh=bHpyczdyb2VzNThr",
    Icon: Instagram,
    className: "text-white",
    style: { background: "linear-gradient(45deg, #f9ce34, #ee2a7b 50%, #6228d7)" },
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/my-home-constructions/",
    Icon: Linkedin,
    className: "bg-[#0a66c2] text-white",
  },
]

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
    <footer id="contact" className="relative bg-[#0a0a0c] text-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.7fr_1fr_1fr_1fr]">
          {/* Brand block */}
          <div>
            <div className="flex items-center gap-2.5">
              <Logo />
              <Wordmark className="text-[20px] text-white" />
            </div>
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-white/50">
              Digi Reco accounts for every kilogram of steel across My Home Constructions sites, from the weighbridge
              to the month-end abstract. Built for internal use by My Home Group.
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
            <p className="text-[14px] font-medium text-white">Get in Touch</p>
            <div className="mt-4 flex items-center gap-2.5">
              {SOCIAL_LINKS.map(({ label, href, Icon, className, style }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  style={style}
                  className={`grid size-9 place-items-center rounded-full shadow-sm transition-transform hover:scale-105 ${className}`}
                >
                  <Icon className="size-4" />
                </a>
              ))}
              <a
                href="https://www.myhomeconstructions.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="My Home Constructions"
                className="grid size-9 place-items-center rounded-full bg-white p-1.5 shadow-sm transition-transform hover:scale-105"
              >
                <LogoMark className="size-full" />
              </a>
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
