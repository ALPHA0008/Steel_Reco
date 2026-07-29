import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import {
  ArrowLeftRight,
  ClipboardCheck,
  FileText,
  Grid3x3,
  HeartPulse,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  PackageOpen,
  Receipt,
  Recycle,
  Ruler,
  Table2,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { LogoMark } from "@/landing/components/Logo"
import { Wordmark } from "@/landing/components/Wordmark"
import { AccountMenu } from "@/landing/components/AccountMenu"

/**
 * App shell: fixed sidebar (nav grouped by task) + compact header + content.
 * User flow follows the task-first principle: a QS lands on Dashboard,
 * enters ledger transactions daily, and reads the Abstract at month-end.
 *
 * The sidebar rests as a slim 68px icon rail and expands to 248px on hover,
 * floating over the content as an overlay (not pushing/reflowing the layout).
 */

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/exceptions", label: "Exceptions", icon: TriangleAlert },
    ],
  },
  {
    label: "Upstream Docs",
    items: [
      { to: "/purchase-orders", label: "Purchase Orders", icon: FileText },
      { to: "/invoices", label: "Supplier Invoices", icon: Receipt },
    ],
  },
  {
    label: "Ledger",
    items: [
      { to: "/grn", label: "GRN", icon: PackageOpen },
      { to: "/store-issues", label: "Store Issues", icon: ArrowLeftRight },
      { to: "/transfers", label: "Transfers", icon: Truck },
      { to: "/bbs", label: "BBS Plan", icon: Ruler },
      { to: "/jmr", label: "JMR Actual", icon: ClipboardCheck },
      { to: "/physical-counts", label: "Physical Count", icon: Grid3x3 },
      // No "Stock at My Home" entry here on purpose. It is one figure per
      // diameter, entered rarely, and it exists to feed a single Abstract row
      // (K = I + J + Stock at My Home) -- so it earns a line in the Abstract,
      // not a permanent seat in the ledger nav beside GRN and Store Issues.
      // The Abstract's own "Stock at My Home" row links through to the record
      // screen; the routes are still live.
      { to: "/scrap", label: "Scrap", icon: Recycle },
    ],
  },
  {
    label: "Report",
    items: [
      { to: "/abstract", label: "Abstract", icon: Table2 },
      { to: "/data-health", label: "Data Health", icon: HeartPulse },
    ],
  },
]

// Admins don't do daily ledger entry -- their nav is the single company-wide
// dashboard and user management. This REPLACES the QS ledger nav for an admin
// (they never land on a single project's ledger).
const ADMIN_NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Admin",
    items: [
      { to: "/dashboard", label: "Admin Dashboard", icon: LayoutGrid, end: true },
      { to: "/admin/users", label: "Users", icon: Users },
    ],
  },
]

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/exceptions": "Exceptions",
  "/purchase-orders": "Purchase Orders",
  "/invoices": "Supplier Invoices",
  "/grn": "GRN",
  "/store-issues": "Store Issues",
  "/transfers": "Inter-site Transfers",
  "/bbs": "BBS Plan",
  "/jmr": "JMR Actual",
  "/physical-counts": "Physical Count",
  "/myhome-stock": "Stock at My Home",
  "/scrap": "Scrap Sales",
  "/abstract": "Monthly Steel Abstract",
  "/data-health": "Data Health",
  "/admin": "Admin Dashboard",
  "/styleguide": "Styleguide",
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** The grouped nav links. Shared by the desktop rail and the mobile drawer.
 * `variant="rail"` supports the hover-collapse icon rail; `variant="drawer"`
 * is always full-width and labeled (mobile), and closes the sheet on tap. */
function NavList({
  navGroups,
  variant,
  collapsed = false,
  onNavigate,
}: {
  navGroups: { label: string; items: NavItem[] }[]
  variant: "rail" | "drawer"
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const iconOnly = variant === "rail" && collapsed
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Main">
      {navGroups.map((group) => (
        <div key={group.label}>
          {!iconOnly && (
            <div className="px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
              {group.label}
            </div>
          )}
          {iconOnly && <div className="pt-4" />}
          {group.items.map((item) =>
            iconOnly ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "relative mb-0.5 flex h-9 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                        "hover:bg-accent hover:text-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isActive && "bg-brand-subtle text-brand-text",
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "relative flex items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors",
                    // Larger tap target in the mobile drawer.
                    variant === "drawer" ? "h-11" : "h-9",
                    "hover:bg-accent hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isActive && "bg-brand-subtle font-semibold text-brand-text",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* The active marker is one shared element per nav variant,
                        so navigating SLIDES it to the new item instead of
                        popping a new pseudo-element into place. layoutId ties
                        the instances together across list items. */}
                    {isActive && (
                      <motion.span
                        layoutId={`nav-active-${variant}`}
                        aria-hidden
                        className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand"
                        transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                      />
                    )}
                    <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ),
          )}
        </div>
      ))}
    </nav>
  )
}

function UserCard({ user, collapsed = false }: { user: ReturnType<typeof useAuth>["user"]; collapsed?: boolean }) {
  return (
    <div className={cn("m-3 flex items-center gap-2.5 rounded-xl border p-2.5", collapsed && "mx-2 justify-center p-2")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {user ? initials(user.full_name || user.username) : "?"}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold">{user?.full_name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.role === "admin" ? "Admin" : "QS"}
          </span>
        </span>
      )}
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === "admin"
  const segments = location.pathname.split("/").filter(Boolean)
  const base = "/" + (segments[0] ?? "")
  // Admin's dashboard is the single company-wide view; a per-site drill-in
  // gets its own title.
  let title: string
  if (segments[0] === "admin" && segments[1] === "sites") title = "Site"
  else if (base === "/dashboard" && isAdmin) title = "Admin Dashboard"
  else title = PAGE_TITLES[base === "/" ? "/" : base] ?? "Digi Reco"

  const [expanded, setExpanded] = useState(false)
  const collapsed = !expanded
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the mobile drawer on route change so a tap navigates AND dismisses.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const navGroups = isAdmin ? ADMIN_NAV_GROUPS : NAV_GROUPS

  return (
    <TooltipProvider delayDuration={200}>
      {/* Below md the rail is hidden entirely and the content spans full width;
          nav lives in a hamburger-triggered drawer. From md up, the grid
          reserves the slim 68px rail and the sidebar floats over it on hover. */}
      <div className="grid h-screen grid-rows-[56px_1fr] md:grid-cols-[68px_1fr]">
        {/* Desktop sidebar (md+) */}
        <aside
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-200 ease-out md:flex",
            expanded ? "w-[248px] shadow-[8px_0_30px_rgba(20,20,22,0.12)]" : "w-[68px]",
          )}
        >
          <div className={cn("flex items-center gap-2.5 px-4 py-3.5", collapsed && "justify-center px-0")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  aria-label="Back to the Digi Reco site"
                  className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-75"
                >
                  {collapsed ? <LogoMark className="size-7" /> : <Wordmark className="text-[19px] text-foreground" />}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Back to the Digi Reco site</TooltipContent>}
            </Tooltip>
          </div>

          <NavList navGroups={navGroups} variant="rail" collapsed={collapsed} />
          <UserCard user={user} collapsed={collapsed} />
        </aside>

        {/* Header — spans full width on mobile, sits beside the rail on md+ */}
        <header className="flex items-center gap-3 border-b bg-card px-4 md:col-start-2 md:px-6">
          {/* Mobile hamburger + drawer */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-1 md:hidden" aria-label="Open navigation menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[264px] flex-col gap-0 p-0">
              <SheetHeader className="border-b px-4 py-3.5 text-left">
                <SheetTitle asChild>
                  <Link to="/" aria-label="Back to the Digi Reco site" className="inline-flex">
                    <Wordmark className="text-[19px] text-foreground" />
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <NavList navGroups={navGroups} variant="drawer" onNavigate={() => setMobileOpen(false)} />
              <UserCard user={user} />
            </SheetContent>
          </Sheet>

          <h1 className="font-display text-[17px] font-semibold tracking-tight">{title}</h1>
          <div className="flex-1" />
          <AccountMenu />
        </header>

        {/* Content */}
        <main className="row-start-2 min-h-0 overflow-y-auto bg-background md:col-start-2">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
