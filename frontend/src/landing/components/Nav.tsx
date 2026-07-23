import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"
import { AccountMenu } from "./AccountMenu"
import { useScrollTo } from "../lib/smooth-scroll"

const NAV_LINKS = [
  { href: "#top", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#walkthrough", label: "Walkthrough" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const scrollTo = useScrollTo()
  const { user, logout } = useAuth()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  function go(hash: string) {
    setMobileOpen(false)
    if (hash === "#top") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      scrollTo(hash)
    }
  }

  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-out-strong",
        scrolled ? "border-b border-border bg-background/80 shadow-sm backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-6">
        {/* Left — logo mark + wordmark */}
        <button onClick={() => go("#top")} className="flex items-center gap-2.5" aria-label="Digi Reco home">
          <Logo />
          <Wordmark className="text-[20px] text-foreground" />
        </button>

        {/* Center — links */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => go(link.href)}
              className="text-[14.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right — account menu when signed in, else the Get Started CTA */}
        <div className="hidden md:block">
          {user ? (
            <AccountMenu showName />
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center rounded-full bg-brand px-7 py-3 text-[14.5px] font-semibold text-brand-foreground shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-out-strong active:scale-[0.98] hover:bg-brand-hover hover:shadow-md hover:shadow-brand/20"
            >
              Get Started
            </Link>
          )}
        </div>

        <button
          className="grid size-10 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-background md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-card md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map((link) => (
              <button
                key={link.href}
                onClick={() => go(link.href)}
                className="rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-muted-foreground hover:bg-background hover:text-foreground"
              >
                {link.label}
              </button>
            ))}
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-brand-foreground"
                >
                  <LayoutDashboard className="size-4" /> Open dashboard
                </Link>
                <button
                  onClick={logout}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-[14px] font-semibold text-foreground"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="mt-2 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-brand-foreground"
              >
                Get Started
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
