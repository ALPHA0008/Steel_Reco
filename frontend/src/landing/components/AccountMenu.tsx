import { Link } from "react-router-dom"
import { ChevronDown, LayoutDashboard, LogOut, Monitor, Moon, Sun, Table2, TriangleAlert, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { useTheme, type ThemePref } from "@/lib/theme"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// QS quick links point at project-scoped pages; an admin has no single project
// and those endpoints reject admins (400 "must specify a project explicitly"),
// so admins get admin-scoped destinations instead.
const QS_QUICK_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exceptions", label: "Exceptions", icon: TriangleAlert },
  { to: "/abstract", label: "Monthly Abstract", icon: Table2 },
]

const ADMIN_QUICK_LINKS = [
  { to: "/dashboard", label: "Admin Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
]

/**
 * Rich account menu: an avatar-based trigger opening a profile card with the
 * signed-in user, a role chip, quick navigation into the tool, and sign-out.
 * Shared by the landing nav and the in-app header so account UX is identical
 * everywhere.
 */
const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
]

/** Segmented Light / System / Dark control — the theme setting lives here. */
function ThemeSegment() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="px-2 py-1.5">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Theme</div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={(e) => {
                e.preventDefault()
                setTheme(opt.value)
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-150 ease-out-strong",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <opt.icon className="size-3.5" strokeWidth={1.8} />
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AccountMenu({ showName = false }: { showName?: boolean }) {
  const { user, logout } = useAuth()
  if (!user) return null

  const name = user.full_name || user.username
  const isAdmin = user.role === "admin"
  const roleLabel = isAdmin ? "Administrator" : "Quantity Surveyor"
  const badge = initials(name)
  const quickLinks = isAdmin ? ADMIN_QUICK_LINKS : QS_QUICK_LINKS

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className={cn(
            "group flex items-center gap-2 rounded-full transition-[transform,box-shadow] duration-150 ease-out-strong outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            showName && "border border-border bg-white/70 py-1 pr-2.5 pl-1 shadow-sm hover:shadow-md",
          )}
        >
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-foreground to-[#3d3e40] text-[12.5px] font-semibold text-white shadow-sm ring-2 ring-white transition-transform duration-150 ease-out-strong [@media(hover:hover)]:group-hover:scale-[1.03]">
            {badge}
          </span>
          {showName && (
            <>
              <span className="max-w-[120px] truncate text-[13.5px] font-semibold text-foreground">{name}</span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-64 rounded-2xl p-1.5 shadow-[0_18px_44px_rgba(20,20,22,0.16)]"
      >
        {/* Profile header */}
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-foreground to-[#3d3e40] text-[13px] font-semibold text-white shadow-sm">
            {badge}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-foreground">{name}</div>
            <div className="truncate text-[12px] text-muted-foreground">@{user.username}</div>
          </div>
        </div>
        <div className="px-2 pb-2">
          <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-semibold text-brand-text">
            {roleLabel}
          </span>
        </div>

        <DropdownMenuSeparator />

        {quickLinks.map((link) => (
          <DropdownMenuItem key={link.to} asChild>
            <Link
              to={link.to}
              className="cursor-pointer gap-2.5 rounded-lg px-2 py-2 text-[13.5px] font-medium"
            >
              <link.icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Theme — kept open on click so the user can preview options live. */}
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ThemeSegment />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={logout}
          className="cursor-pointer gap-2.5 rounded-lg px-2 py-2 text-[13.5px] font-medium text-danger focus:bg-danger-subtle focus:text-danger"
        >
          <LogOut className="size-4" strokeWidth={1.8} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
