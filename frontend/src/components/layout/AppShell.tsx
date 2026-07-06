import { useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import {
  ArrowLeftRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileText,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  PackageOpen,
  Receipt,
  Recycle,
  Ruler,
  Table2,
  TriangleAlert,
  Truck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Wordmark } from "@/landing/components/Wordmark"


const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed"

/**
 * App shell: fixed sidebar (nav grouped by task) + compact header + content.
 * User flow follows the task-first principle: a QS lands on Dashboard,
 * enters ledger transactions daily, and reads the Abstract at month-end.
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
  const { user, logout } = useAuth()
  const location = useLocation()
  const base = "/" + (location.pathname.split("/")[1] ?? "")
  const title = PAGE_TITLES[base === "/" ? "/" : base] ?? "Niṣṭhā"

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  )

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0")
      return next
    })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "grid h-screen grid-rows-[56px_1fr] transition-[grid-template-columns] duration-200",
          collapsed ? "grid-cols-[68px_1fr]" : "grid-cols-[248px_1fr]",
        )}
      >
        {/* Sidebar */}
        <aside className="row-span-2 flex min-h-0 flex-col border-r bg-sidebar">
          <div
            className={cn(
              "flex items-center gap-2.5 px-4 py-3.5",
              collapsed && "justify-center px-0",
            )}
          >
            {!collapsed && <Wordmark className="text-[19px] text-foreground" />}
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Main">
            {NAV_GROUPS.map((group) => (
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

          <div className="border-t p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className={cn(
                    "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    collapsed && "justify-center",
                  )}
                >
                  {collapsed ? (
                    <ChevronsRight className="size-[18px] shrink-0" strokeWidth={1.6} />
                  ) : (
                    <>
                      <ChevronsLeft className="size-[18px] shrink-0" strokeWidth={1.6} />
                      Collapse
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
            </Tooltip>
          </div>

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
        <header className="flex items-center gap-3 border-b bg-card px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-tight">{title}</h1>
          <div className="flex-1" />
          {/* ThemeToggle removed — dark mode not supported in v1 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {user?.username}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {user?.full_name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Content */}
        <main className="min-h-0 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
