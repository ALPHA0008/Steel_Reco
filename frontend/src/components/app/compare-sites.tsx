import { useState } from "react"
import { ArrowRight, GitCompare, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnalyticsSite } from "@/lib/types"

function pick(sites: AnalyticsSite[], id: string | null) {
  return id ? sites.find((s) => s.project_id === id) ?? null : null
}

function Row({ label, a, b, fmt, betterLower = true }: {
  label: string
  a: number | null
  b: number | null
  fmt: (n: number) => string
  betterLower?: boolean
}) {
  const both = a != null && b != null
  const aBetter = both && (betterLower ? a < b : a > b)
  const bBetter = both && (betterLower ? b < a : b > a)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/40 py-2 last:border-0">
      <div className={cn("tnum text-right text-[14px] font-semibold", aBetter ? "text-success" : both && !aBetter ? "text-foreground" : "text-muted-foreground")}>
        {a == null ? "—" : fmt(a)}
      </div>
      <div className="w-24 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tnum text-left text-[14px] font-semibold", bBetter ? "text-success" : both && !bBetter ? "text-foreground" : "text-muted-foreground")}>
        {b == null ? "—" : fmt(b)}
      </div>
    </div>
  )
}

/** Project comparison mode — pick two sites, see every metric side by side with
 * the better value highlighted. Built for review meetings. */
export function CompareSites({ sites }: { sites: AnalyticsSite[] }) {
  const [aId, setAId] = useState<string | null>(sites[0]?.project_id ?? null)
  const [bId, setBId] = useState<string | null>(sites[1]?.project_id ?? null)
  const [open, setOpen] = useState(false)

  const a = pick(sites, aId)
  const b = pick(sites, bId)

  const Select = ({ value, onChange, exclude }: { value: string | null; onChange: (v: string) => void; exclude: string | null }) => (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {sites.map((s) => (
        <option key={s.project_id} value={s.project_id} disabled={s.project_id === exclude}>
          {s.name}
        </option>
      ))}
    </select>
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground shadow-sm transition-colors hover:bg-row-hover"
      >
        <GitCompare className="size-4 text-brand-text" /> Compare sites
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="size-4 text-brand-text" />
          <h3 className="text-[14px] font-semibold tracking-tight">Compare sites</h3>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Select value={aId} onChange={setAId} exclude={bId} />
        <ArrowRight className="size-4 text-muted-foreground" />
        <Select value={bId} onChange={setBId} exclude={aId} />
      </div>

      <div>
        <Row label="Health" a={a?.health ?? null} b={b?.health ?? null} fmt={(n) => String(n)} betterLower={false} />
        <Row label="Wastage" a={a?.wastage_pct ?? null} b={b?.wastage_pct ?? null} fmt={(n) => `${n.toFixed(2)}%`} />
        <Row label="Received" a={a?.received_mt ?? null} b={b?.received_mt ?? null} fmt={(n) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`} betterLower={false} />
        <Row label="Scrap" a={a?.scrap_mt ?? null} b={b?.scrap_mt ?? null} fmt={(n) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MT`} />
        <Row label="Exceptions" a={a?.open_exceptions ?? null} b={b?.open_exceptions ?? null} fmt={(n) => n.toLocaleString("en-IN")} />
        <Row label="Forecast" a={a?.forecast_pct ?? null} b={b?.forecast_pct ?? null} fmt={(n) => `${n.toFixed(2)}%`} />
      </div>
      <div className="mt-2 text-center text-[10.5px] text-muted-foreground">green = better on that metric</div>
    </div>
  )
}
