import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, LayoutGrid, Search, Users, Filter } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

interface Command {
  id: string
  label: string
  hint?: string
  icon: typeof Building2
  run: () => void
}

/**
 * Global command palette (Ctrl/Cmd-K). Jump to any site, filter the dashboard
 * by a site, or navigate. Fuzzy-ish substring match, keyboard-driven.
 */
export function CommandPalette({
  sites,
  onFilterSite,
  onOpenSite,
}: {
  sites: AnalyticsSite[]
  onFilterSite: (id: string | null) => void
  onOpenSite: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ("")
      setActive(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = []
    for (const s of sites) {
      cmds.push({
        id: `open-${s.project_id}`,
        label: `Open ${s.name}`,
        hint: s.location ?? "site detail",
        icon: Building2,
        run: () => { onOpenSite(s.project_id); setOpen(false) },
      })
      cmds.push({
        id: `filter-${s.project_id}`,
        label: `Filter dashboard to ${s.name}`,
        hint: "cross-filter",
        icon: Filter,
        run: () => { onFilterSite(s.project_id); setOpen(false) },
      })
    }
    cmds.push({ id: "clear", label: "Clear all filters", hint: "show whole portfolio", icon: LayoutGrid, run: () => { onFilterSite(null); setOpen(false) } })
    cmds.push({ id: "users", label: "Go to Users", icon: Users, run: () => { navigate("/admin/users"); setOpen(false) } })
    return cmds
  }, [sites, onFilterSite, onOpenSite, navigate])

  const filtered = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return commands
    // every typed word must appear somewhere in the label/hint (order-free)
    return commands.filter((c) => {
      const hay = (c.label + " " + (c.hint ?? "")).toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [commands, q])

  const clamped = Math.min(active, Math.max(0, filtered.length - 1))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[18%] max-w-[560px] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === "Enter") { e.preventDefault(); filtered[clamped]?.run() }
        }}
      >
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            placeholder="Search sites, filters, actions…"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1.5">
          {filtered.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">No matches.</div>}
          {filtered.map((c, i) => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={c.run}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  i === clamped ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1 text-[13.5px] font-medium text-foreground">{c.label}</span>
                {c.hint && <span className="text-[11.5px] text-muted-foreground">{c.hint}</span>}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
