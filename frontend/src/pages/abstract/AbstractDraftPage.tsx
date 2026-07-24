import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, OctagonAlert, Sparkles, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useDiaGrades, useDraftAbstract, diaLabel } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { DraftAbstractRequest, DraftAbstractResponse } from "@/lib/types"

/** Which typed rows exist, in the order they appear in the entry grid. Codes
 * mirror the real Abstract's A-N letters so switching between the two reads
 * naturally, even though C/G/H/K/L/M are always derived, never typed here. */
const ENTRY_ROWS: { key: keyof DraftAbstractRequest & string; code: string; label: string }[] = [
  { key: "section_a_received", code: "A", label: "Received" },
  { key: "section_b_transferred", code: "B", label: "Transferred out" },
  { key: "section_myhome_stock", code: "C1", label: "Stock at My Home" },
  { key: "section_d_issued", code: "D", label: "Issued to Contractor" },
  { key: "section_e_consumption", code: "E", label: "Consumption" },
  { key: "section_f_wip", code: "F", label: "Work in Progress" },
  { key: "section_i_physical_full_length", code: "I", label: "Physical — Full length" },
  { key: "section_j_physical_cut_pieces", code: "J", label: "Physical — Cut pieces (stock)" },
]

type Grid = Record<string, Record<string, string>>

const SEVERITY_ICON: Record<string, typeof OctagonAlert> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
}
const SEVERITY_TONE: Record<string, string> = {
  critical: "border-l-danger bg-danger-subtle text-danger",
  warning: "border-l-warning bg-warning-subtle text-warning",
}

/**
 * Quick Draft: for someone who already knows the Abstract's numbers by heart
 * (no ledger rows, no uploaded documents behind them) -- type A/B/D/E/F/I/J/
 * MyHome/N per diameter and see it mathematically verified: the same
 * derivation the real Abstract uses (C=A-B, G=E+F, H=C-G, K=I+J+MyHome,
 * L=H-K, M=L/G) plus the same class of plausibility rules (issued > net
 * received, wastage vs cap, scrap vs generated, per-dia sanity, and a
 * cross-check against this project's real BBS plan). Nothing here is ever
 * saved -- it's a scratch check, not an official Abstract.
 */
export function AbstractDraftPage() {
  const dias = useDiaGrades()
  const draft = useDraftAbstract()

  const diaCols = useMemo(
    () => (dias.data ?? []).map((d) => d.diameter_mm).sort((a, b) => parseFloat(a) - parseFloat(b)),
    [dias.data],
  )

  const [grid, setGrid] = useState<Grid>({})
  const [capPct, setCapPct] = useState("3.00")
  const [scrapKg, setScrapKg] = useState("")
  const [result, setResult] = useState<DraftAbstractResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setCell(rowKey: string, dia: string, value: string) {
    setGrid((g) => ({ ...g, [rowKey]: { ...g[rowKey], [dia]: value } }))
    setResult(null)
  }

  function cleanRow(rowKey: string): Record<string, string> {
    const row = grid[rowKey] ?? {}
    const out: Record<string, string> = {}
    for (const dia of diaCols) {
      const v = row[dia]
      if (v != null && v.trim() !== "") out[dia] = v
    }
    return out
  }

  async function runCheck() {
    setError(null)
    const payload: DraftAbstractRequest = {
      period_label: "Quick Draft",
      cap_pct: capPct || "3.00",
      section_a_received: cleanRow("section_a_received"),
      section_b_transferred: cleanRow("section_b_transferred"),
      section_d_issued: cleanRow("section_d_issued"),
      section_e_consumption: cleanRow("section_e_consumption"),
      section_f_wip: cleanRow("section_f_wip"),
      section_i_physical_full_length: cleanRow("section_i_physical_full_length"),
      section_j_physical_cut_pieces: cleanRow("section_j_physical_cut_pieces"),
      section_myhome_stock: cleanRow("section_myhome_stock"),
      section_n_scrap_sold_kg: scrapKg || "0",
    }
    try {
      const res = await draft.mutateAsync(payload)
      setResult(res)
    } catch (err) {
      setError(apiErrorMessage(err, "Could not run the check."))
    }
  }

  function fmt(v: string | undefined): string {
    if (v == null) return "—"
    const n = parseFloat(v)
    if (!Number.isFinite(n) || n === 0) return "—"
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
  }

  return (
    <Page>
      <PageHeader
        title="Quick Draft"
        description="Already know the numbers? Type A-N per diameter and get them mathematically verified — no ledger entry, nothing saved."
        actions={
          <Button variant="outline" asChild>
            <Link to="/abstract">
              <ArrowLeft /> Back to Abstract
            </Link>
          </Button>
        }
      />

      <Banner variant="advisory" className="mb-4">
        This is a scratch check. Nothing you type here is written to any ledger or saved as an official Abstract —
        it only verifies that your numbers are internally consistent.
      </Banner>

      {error && (
        <Banner variant="blocking" className="mb-4">
          {error}
        </Banner>
      )}

      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 h-10 min-w-56 border-b bg-muted px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  Section
                </th>
                {diaCols.map((dia) => (
                  <th
                    key={dia}
                    className="h-10 min-w-28 border-b bg-muted px-2 text-right text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
                  >
                    {parseFloat(dia)} mm
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ENTRY_ROWS.map((row) => (
                <tr key={row.key} className="odd:bg-row-stripe">
                  <td className="sticky left-0 z-10 h-11 border-b bg-row-pinned px-4 font-medium">
                    {row.code} · {row.label}
                  </td>
                  {diaCols.map((dia) => (
                    <td key={dia} className="h-11 border-b px-1.5">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0"
                        className="tnum h-8 w-full text-right"
                        value={grid[row.key]?.[dia] ?? ""}
                        onChange={(e) => setCell(row.key, dia, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="odd:bg-row-stripe">
                <td className="sticky left-0 z-10 h-11 border-b bg-row-pinned px-4 font-medium">N · Scrap Sold (kg)</td>
                <td className="h-11 border-b px-1.5" colSpan={diaCols.length}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0"
                    className="tnum h-8 w-40 text-right"
                    value={scrapKg}
                    onChange={(e) => {
                      setScrapKg(e.target.value)
                      setResult(null)
                    }}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Wastage cap
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="tnum h-8 w-20 text-right"
              value={capPct}
              onChange={(e) => {
                setCapPct(e.target.value)
                setResult(null)
              }}
            />
            %
          </label>
          <div className="flex-1" />
          <Button
            onClick={runCheck}
            disabled={draft.isPending}
            className="bg-brand text-brand-foreground hover:bg-brand-hover"
          >
            <Sparkles /> {draft.isPending ? "Checking…" : "Analyze"}
          </Button>
        </div>
      </Card>

      {result && (
        <div className="mt-5 space-y-4">
          <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
            <div className="border-b px-4 py-3">
              <div className="text-[13.5px] font-semibold">Derived sections</div>
              <p className="text-[11.5px] text-muted-foreground">
                Computed from what you typed — the same formulas the real Abstract uses.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 h-9 min-w-56 border-b bg-muted px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Derived
                    </th>
                    {diaCols.map((dia) => (
                      <th key={dia} className="h-9 border-b bg-muted px-2 text-right text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                        {parseFloat(dia)} mm
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { code: "C", label: "Net Received", values: result.section_c_net_received },
                    { code: "G", label: "Consumption + WIP", values: result.section_g_consumption_plus_wip },
                    { code: "H", label: "Theoretical Stock", values: result.section_h_theoretical_stock },
                    { code: "K", label: "Total Physical", values: result.section_k_total_physical },
                    { code: "L", label: "Wastage Qty", values: result.section_l_wastage_qty },
                  ].map((r) => (
                    <tr key={r.code} className="odd:bg-row-stripe">
                      <td className="sticky left-0 z-10 h-9 border-b bg-row-pinned px-4 font-medium text-info">
                        {r.code} · {r.label}
                      </td>
                      {diaCols.map((dia) => (
                        <td key={dia} className="tnum h-9 border-b px-2 text-right">
                          {fmt(r.values[dia])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">M · Wastage %</span>
              <span
                className={cn(
                  "tnum text-[20px] font-bold",
                  result.section_m_wastage_pct != null && parseFloat(result.section_m_wastage_pct) > parseFloat(capPct || "3")
                    ? "text-danger"
                    : "text-success",
                )}
              >
                {result.section_m_wastage_pct == null ? "—" : `${parseFloat(result.section_m_wastage_pct).toFixed(2)}%`}
              </span>
              <span className="text-[11.5px] text-muted-foreground">vs {capPct}% cap</span>
            </div>
          </Card>

          <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
            <div className="border-b px-4 py-3">
              <div className="text-[13.5px] font-semibold">
                {result.findings.length === 0 ? "All clear" : `${result.findings.length} thing${result.findings.length === 1 ? "" : "s"} to check`}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Common-sense plausibility rules — the same class the real Abstract runs, plus a cross-check against
                this project's actual BBS plan.
              </p>
            </div>
            {result.findings.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                Nothing looks off — the typed numbers are internally consistent.
              </div>
            ) : (
              <div className="divide-y">
                {result.findings.map((f, i) => {
                  const Icon = SEVERITY_ICON[f.severity] ?? TriangleAlert
                  return (
                    <div
                      key={`${f.rule}-${i}`}
                      className={cn("flex items-start gap-3 border-l-4 px-4 py-3", SEVERITY_TONE[f.severity] ?? "border-l-warning")}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1 text-[13px] text-foreground">
                        {f.dia && <span className="font-semibold">{parseFloat(f.dia)}mm: </span>}
                        {f.message}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </Page>
  )
}
