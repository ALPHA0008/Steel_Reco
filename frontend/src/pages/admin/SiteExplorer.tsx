import { useMemo, useState, type ReactNode } from "react"
import { ArrowUpDown, Building2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Sparkline } from "@/components/app/sparkline"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

type SortKey = "name" | "health" | "wastage_pct" | "received_mt" | "scrap_mt" | "open_exceptions"
type RiskFilter = "all" | AnalyticsSite["risk"]

const RISK_TONE: Record<AnalyticsSite["risk"], string> = {
  low: "bg-success-subtle text-success",
  medium: "bg-info-subtle text-info",
  high: "bg-warning-subtle text-warning",
  critical: "bg-danger-subtle text-danger",
}
const RISK_ORDER: Record<AnalyticsSite["risk"], number> = { critical: 0, high: 1, medium: 2, low: 3 }

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

/**
 * Site Performance Explorer — the intelligent replacement for repetitive
 * project cards. Search, sort by any column, filter by risk, sticky header,
 * a per-row wastage sparkline, and click-to-open the detail drawer. Default
 * sort surfaces the sites that need attention (worst risk first).
 */
export function SiteExplorer({
  sites,
  onOpen,
}: {
  sites: AnalyticsSite[]
  onOpen: (site: AnalyticsSite) => void
}) {
  const [query, setQuery] = useState("")
  const [risk, setRisk] = useState<RiskFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("health")
  const [sortAsc, setSortAsc] = useState(true) // health asc = worst first

  const rows = useMemo(() => {
    let r = sites
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter((s) => s.name.toLowerCase().includes(q) || (s.location ?? "").toLowerCase().includes(q))
    }
    if (risk !== "all") r = r.filter((s) => s.risk === risk)
    const dir = sortAsc ? 1 : -1
    return [...r].sort((a, b) => {
      let av: number | string
      let bv: number | string
      if (sortKey === "name") {
        av = a.name
        bv = b.name
        return av.localeCompare(bv) * dir
      }
      av = (a[sortKey] as number | null) ?? 0
      bv = (b[sortKey] as number | null) ?? 0
      return (av - bv) * dir
    })
  }, [sites, query, risk, sortKey, sortAsc])

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((v) => !v)
    else {
      setSortKey(k)
      setSortAsc(k === "name") // names A→Z, numbers high→low by default
    }
  }

  const Th = ({ k, children, numeric }: { k: SortKey; children: ReactNode; numeric?: boolean }) => (
    <th
      className={cn(
        "sticky top-0 z-10 h-9 cursor-pointer select-none border-b bg-muted/80 px-4 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground backdrop-blur",
        numeric ? "text-right" : "text-left",
      )}
      onClick={() => toggleSort(k)}
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "flex-row-reverse")}>
        {children}
        <ArrowUpDown className={cn("size-3", sortKey === k ? "text-foreground" : "text-muted-foreground/40")} />
      </span>
    </th>
  )

  const RISKS: RiskFilter[] = ["all", "critical", "high", "medium", "low"]

  return (
    <div className="rounded-2xl border bg-card shadow-(--shadow-card)">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites…"
            className="h-8 w-56 pl-8 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1">
          {RISKS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRisk(r)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                risk === r ? (r === "all" ? "bg-foreground text-background" : RISK_TONE[r as AnalyticsSite["risk"]]) : "text-muted-foreground hover:bg-muted",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-muted-foreground">{rows.length} sites</span>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th k="name">Site</Th>
              <Th k="health" numeric>Health</Th>
              <th className="sticky top-0 z-10 h-9 border-b bg-muted/80 px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground backdrop-blur">Risk</th>
              <Th k="wastage_pct" numeric>Wastage</Th>
              <th className="sticky top-0 z-10 h-9 border-b bg-muted/80 px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground backdrop-blur">Trend</th>
              <Th k="received_mt" numeric>Received</Th>
              <Th k="scrap_mt" numeric>Scrap</Th>
              <Th k="open_exceptions" numeric>Exceptions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.project_id}
                onClick={() => onOpen(s)}
                className="cursor-pointer border-b transition-colors odd:bg-row-stripe hover:bg-row-hover"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand-text">
                      <Building2 className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{s.name}</div>
                      {s.location && <div className="truncate text-[11px] text-muted-foreground">{s.location}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 text-right">
                  <span
                    className="tnum font-semibold"
                    style={{ color: s.health >= 75 ? "var(--success)" : s.health >= 55 ? "var(--info)" : s.health >= 35 ? "var(--warning)" : "var(--danger)" }}
                  >
                    {s.health}
                  </span>
                </td>
                <td className="px-4">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", RISK_TONE[s.risk])}>
                    {s.risk}
                  </span>
                </td>
                <td className="px-4 text-right">
                  <span className={cn("tnum font-semibold", s.over_cap ? "text-danger" : "text-success")}>
                    {s.wastage_pct == null ? "—" : `${s.wastage_pct.toFixed(2)}%`}
                  </span>
                </td>
                <td className="px-4">
                  <span className={cn(s.over_cap ? "text-danger" : "text-success")}>
                    {s.spark.length >= 2 ? <Sparkline data={s.spark} width={80} height={24} /> : <span className="text-[11px] text-muted-foreground">—</span>}
                  </span>
                </td>
                <td className="tnum px-4 text-right">{fmt(s.received_mt)} MT</td>
                <td className="tnum px-4 text-right">{fmt(s.scrap_mt)} MT</td>
                <td className="px-4 text-right">
                  <span className={cn("tnum font-semibold", s.open_exceptions > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {s.open_exceptions.toLocaleString("en-IN")}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[13px] text-muted-foreground">
                  No sites match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
