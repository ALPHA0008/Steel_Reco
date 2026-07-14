import { useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import {
  ArrowLeftRight,
  ClipboardCheck,
  FileText,
  Grid3x3,
  LayoutDashboard,
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
      { to: "/scrap", label: "Scrap", icon: Recycle },
    ],
  },
  {
    label: "Report",
    items: [{ to: "/abstract", label: "Abstract", icon: Table2 }],
  },
]

const ADMIN_NAV_GROUP: { label: string; items: NavItem[] } = {
  label: "Admin",
  items: [{ to: "/admin/users", label: "Users", icon: Users }],
}

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
  "/scrap": "Scrap Sales",
  "/abstract": "Monthly Steel Abstract",
  "/admin": "Users",
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

export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const base = "/" + (location.pathname.split("/")[1] ?? "")
  const title = PAGE_TITLES[base === "/" ? "/" : base] ?? "Digi Reco"

  const [expanded, setExpanded] = useState(false)
  const collapsed = !expanded

  const navGroups = user?.role === "admin" ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS

  return (
    <TooltipProvider delayDuration={200}>
      {/* The grid always reserves the slim 68px rail so the header/content
          never shift; the sidebar itself floats over that gutter and beyond
          it when expanded on hover. */}
      <div className="grid h-screen grid-cols-[68px_1fr] grid-rows-[56px_1fr]">
        {/* Sidebar */}
        <aside
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-sidebar transition-[width] duration-200 ease-out",
            expanded ? "w-[248px] shadow-[8px_0_30px_rgba(20,20,22,0.12)]" : "w-[68px]",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 px-4 py-3.5",
              collapsed && "justify-center px-0",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  aria-label="Back to the Digi Reco site"
                  className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-75"
                >
                  {collapsed ? (
                    <LogoMark className="size-7" />
                  ) : (
                    <Wordmark className="text-[19px] text-foreground" />
                  )}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Back to the Digi Reco site</TooltipContent>}
            </Tooltip>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Main">
            {navGroups.map((group) => (
              <div key={group.label}>
                {!collapsed && (
                  <div className="px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
                    {group.label}
                  </div>
                )}
                {collapsed && <div className="pt-4" />}
                {group.items.map((item) =>
                  collapsed ? (
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
                      className={({ isActive }) =>
                        cn(
                          "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors",
                          "hover:bg-accent hover:text-foreground",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          isActive &&
                            "bg-brand-subtle font-semibold text-brand-text before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-brand",
                        )
                      }
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} />
                      {item.label}
                    </NavLink>
                  ),
                )}
              </div>
            ))}
          </nav>

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
        </aside>

        {/* Header */}
        <header className="col-start-2 flex items-center gap-3 border-b bg-card px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-tight">{title}</h1>
          <div className="flex-1" />
          <AccountMenu />
        </header>

        {/* Content */}
        <main className="col-start-2 row-start-2 min-h-0 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
