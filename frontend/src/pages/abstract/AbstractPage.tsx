import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight, Download, Lock, RotateCcw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ReconciliationFlow } from "./reconciliation-flow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAbstract, useFinalizeMonth, useMyProject, usePeriodBounds, useReopenMonth } from "@/lib/queries"
import { apiErrorMessage, downloadAbstractXlsx } from "@/lib/api"
import type { AbstractResponse } from "@/lib/types"

/**
 * The digital twin of the QS's Excel Abstract (design.md §9.4).
 * Read-only — no cell is ever editable; every computed row shows its formula.
 * All figures come from /abstract (SQL over the ledger), never typed.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type ByDia = Record<string, number>

function addTo(map: ByDia, dia: string, v: string | null | undefined) {
  const n = v == null ? 0 : parseFloat(v)
  if (!Number.isFinite(n)) return
  map[dia] = (map[dia] ?? 0) + n
}

function fromDict(d: Record<string, string>): ByDia {
  const out: ByDia = {}
  for (const [dia, v] of Object.entries(d)) addTo(out, dia, v)
  return out
}

interface AbstractRow {
  code: string
  label: string
  formula?: string
  computed?: boolean
  values: ByDia
  /** row whose Total cell is a single scalar (M %, N kg) */
  scalar?: string | null
  danger?: boolean
  /** a labeled sub-line that's informational only (e.g. Safety Steel is
   *  already inside J's total) — rendered indented/muted, excluded from
   *  the running dia list's "is this a real section" semantics. */
  breakout?: boolean
}

function buildRows(a: AbstractResponse, capPct: number): { rows: AbstractRow[]; dias: string[] } {
  const A: ByDia = {}
  a.section_a_received.forEach((r) => addTo(A, r.dia, r.total_received_kg))
  const B: ByDia = {}
  a.section_b_transferred.forEach((r) => addTo(B, r.dia, r.total_transferred_kg))
  const C = fromDict(a.section_c_net_received)
  const D: ByDia = {}
  a.section_d_issued.forEach((r) => addTo(D, r.dia, r.net_issued_kg))
  const E: ByDia = {}
  a.section_e_consumption.forEach((r) => addTo(E, r.dia, r.consumption_kg))
  const F: ByDia = {}
  a.section_f_wip.forEach((r) => addTo(F, r.dia, r.wip_kg))
  const G = fromDict(a.section_g_consumption_plus_wip)
  const H = fromDict(a.section_h_theoretical_stock)
  const I: ByDia = {}
  const J: ByDia = {}
  // Safety steel is a labeled BREAKOUT of J (display only) -- it's already
  // inside cut_piece_stock_kg, so it must never be added again anywhere.
  const SAFETY: ByDia = {}
  a.sections_ij_physical_stock.forEach((r) => {
    addTo(I, r.dia, r.full_length_kg)
    addTo(J, r.dia, r.cut_piece_stock_kg)
    addTo(SAFETY, r.dia, r.safety_steel_kg)
  })
  const MYHOME = fromDict(a.section_myhome_stock)
  const K = fromDict(a.section_k_total_physical)
  const L = fromDict(a.section_l_wastage_qty)

  const dias = Array.from(
    new Set([A, B, C, D, E, F, G, H, I, J, SAFETY, MYHOME, K, L].flatMap((m) => Object.keys(m))),
  ).sort((x, y) => parseFloat(x) - parseFloat(y))

  const m = a.section_m_wastage_pct == null ? null : parseFloat(a.section_m_wastage_pct)

  const rows: AbstractRow[] = [
    { code: "A", label: "Received", values: A },
    { code: "B", label: "Transferred out", values: B },
    { code: "C", label: "Net Received", formula: "C = A − B", computed: true, values: C },
    {
      code: "C1",
      label: "Stock at My Home",
      formula: "Latest snapshot — steel at My Home's own yard, not a contractor's site",
      values: MYHOME,
      breakout: true,
    },
    { code: "D", label: "Issued to Contractor", formula: "D = Σ issues out − Σ returns in (genuine sum, never = C)", values: D },
    { code: "E", label: "Consumption", values: E },
    { code: "F", label: "Work in Progress", values: F },
    { code: "G", label: "Consumption + WIP", formula: "G = E + F", computed: true, values: G },
    { code: "H", label: "Theoretical Stock", formula: "H = C − G", computed: true, values: H },
    { code: "I", label: "Physical — Full length", values: I },
    {
      code: "I1",
      label: "— of which, Safety Steel",
      formula: "Already counted inside J (Cut pieces) — shown separately for visibility, never added again",
      values: SAFETY,
      breakout: true,
    },
    { code: "J", label: "Physical — Cut pieces (stock)", values: J },
    { code: "K", label: "Total Physical", formula: "K = I + J + Stock at My Home", computed: true, values: K },
    { code: "L", label: "Wastage Qty", formula: "L = H − K", computed: true, values: L },
    {
      code: "M",
      label: "Wastage %",
      formula: "M = L / G (corrected 2026-07-16, verified against the real business formula)",
      computed: true,
      values: {},
      scalar: m == null ? "—" : `${m.toFixed(2)}%`,
      danger: m != null && m > capPct,
    },
    { code: "N", label: "Scrap Sold", values: {}, scalar: null },
  ]
  return { rows, dias }
}

/** Which of the four narrative bands each row belongs to. Turns 14 undifferentiated
 *  stripes into a readable structure: what came in, what went out/used, what's
 *  left, and the result. */
const BAND_OF: Record<string, string> = {
  A: "Inbound", B: "Inbound", C: "Inbound", C1: "Inbound",
  D: "Issued & consumed", E: "Issued & consumed", F: "Issued & consumed", G: "Issued & consumed",
  H: "Stock", I: "Stock", I1: "Stock", J: "Stock", K: "Stock",
  L: "Reconciliation", M: "Reconciliation", N: "Reconciliation",
}

function fmt(kg: number | undefined, unit: "kg" | "mt"): string {
  if (kg === undefined || kg === 0) return "—"
  const v = unit === "mt" ? kg / 1000 : kg
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** month index (year*12+month) for easy comparison/clamping */
function periodIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

export function AbstractPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [unit, setUnit] = useState<"kg" | "mt">("mt")
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const [pickerMonth, setPickerMonth] = useState(month)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const didInitFromBounds = useRef(false)

  async function handleExport() {
    setExporting(true)
    try {
      await downloadAbstractXlsx(year, month)
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not export the Abstract."))
    } finally {
      setExporting(false)
    }
  }

  const project = useMyProject()
  const bounds = usePeriodBounds()
  const abstract = useAbstract(year, month)
  const finalize = useFinalizeMonth()
  const reopen = useReopenMonth()

  // Default to the latest month with real activity, not today's calendar
  // date -- opening the Abstract fresh should land you on data, not on
  // whatever month it happens to be in the real world. Runs once, the first
  // time bounds arrive; never overrides a period the user has navigated to.
  useEffect(() => {
    if (didInitFromBounds.current) return
    if (bounds.data?.latest_year == null || bounds.data?.latest_month == null) return
    didInitFromBounds.current = true
    setYear(bounds.data.latest_year)
    setMonth(bounds.data.latest_month)
  }, [bounds.data])

  const capPct = project.data ? parseFloat(project.data.contract_wastage_pct) : 3.0
  const built = useMemo(
    () => (abstract.data ? buildRows(abstract.data, capPct) : null),
    [abstract.data, capPct],
  )

  const latestIdx =
    bounds.data?.latest_year != null && bounds.data?.latest_month != null
      ? periodIndex(bounds.data.latest_year, bounds.data.latest_month)
      : null
  const earliestIdx =
    bounds.data?.earliest_year != null && bounds.data?.earliest_month != null
      ? periodIndex(bounds.data.earliest_year, bounds.data.earliest_month)
      : null
  const currentIdx = periodIndex(year, month)
  const atLatest = latestIdx != null && currentIdx >= latestIdx
  const atEarliest = earliestIdx != null && currentIdx <= earliestIdx

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    const nextIdx = periodIndex(d.getFullYear(), d.getMonth() + 1)
    if (latestIdx != null && nextIdx > latestIdx) return
    if (earliestIdx != null && nextIdx < earliestIdx) return
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  function openPicker() {
    setPickerYear(year)
    setPickerMonth(month)
    setPickerOpen(true)
  }

  function applyPicker() {
    setYear(pickerYear)
    setMonth(pickerMonth)
    setPickerOpen(false)
  }

  const yearOptions =
    bounds.data?.earliest_year != null && bounds.data?.latest_year != null
      ? Array.from(
          { length: bounds.data.latest_year - bounds.data.earliest_year + 1 },
          (_, i) => bounds.data!.earliest_year! + i,
        )
      : [year]

  const monthOptionsForPickerYear = MONTH_NAMES.map((name, i) => {
    const idx = periodIndex(pickerYear, i + 1)
    const inBounds = (earliestIdx == null || idx >= earliestIdx) && (latestIdx == null || idx <= latestIdx)
    return { value: i + 1, name, disabled: !inBounds }
  })

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`
  const scrapKg = abstract.data ? parseFloat(abstract.data.section_n_scrap_sold_kg) : 0

  // Anchor totals for the flow strip — summed straight off the built rows so
  // they always match the matrix. C = net received, G = consumed+WIP,
  // K = total physical, L = wastage qty, M = wastage %.
  const rowTotal = (code: string) => {
    const r = built?.rows.find((x) => x.code === code)
    if (!r) return 0
    return Object.values(r.values).reduce((s, v) => s + v, 0)
  }
  const wastagePct =
    abstract.data?.section_m_wastage_pct == null ? null : parseFloat(abstract.data.section_m_wastage_pct)

  return (
    <Page>
      <PageHeader
        title="Monthly Steel Abstract"
        description="Cumulative since project start · read-only · every figure computed from ledger rows, never typed."
        actions={
          <>
            <div className="flex items-center rounded-lg border">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                disabled={atEarliest}
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft />
              </Button>
              <button
                type="button"
                onClick={openPicker}
                className="tnum min-w-32 cursor-pointer rounded-md px-1 text-center text-[13px] font-semibold hover:bg-muted"
                title="Jump to a month"
              >
                {periodLabel}
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                disabled={atLatest}
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Tabs value={unit} onValueChange={(v) => setUnit(v as "kg" | "mt")}>
              <TabsList>
                <TabsTrigger value="mt">MT</TabsTrigger>
                <TabsTrigger value="kg">KG</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" asChild>
              <Link to="/abstract/draft">
                <Sparkles /> Quick Draft
              </Link>
            </Button>
            <Button variant="outline" disabled={exporting} onClick={handleExport}>
              <Download /> {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button variant="outline" onClick={() => setReopenOpen(true)}>
              <RotateCcw /> Reopen
            </Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-hover"
              onClick={() => setFinalizeOpen(true)}
            >
              <Lock /> Finalize
            </Button>
          </>
        }
      />

      {actionError && (
        <Banner variant="blocking" className="mb-4" onDismiss={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}
      {abstract.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(abstract.error, "Could not compute the Abstract.")}
        </Banner>
      )}

      {/* Aggregate cross-checks: what the computed totals say doesn't
          reconcile (E+F vs BBS, wastage vs cap, scrap vs generated, safety
          steel vs backup). Advisory — the Abstract still renders below. */}
      {(abstract.data?.findings ?? []).map((f, i) => (
        <Banner key={`${f.rule}-${f.dia ?? "all"}-${i}`} variant="advisory" className="mb-3">
          {f.message}
        </Banner>
      ))}

      {built && (
        <ReconciliationFlow
          netReceivedKg={rowTotal("C")}
          consumedWipKg={rowTotal("G")}
          physicalKg={rowTotal("K")}
          wastageKg={rowTotal("L")}
          wastagePct={wastagePct}
          capPct={capPct}
          scrapKg={scrapKg}
          unit={unit}
          fmt={fmt}
        />
      )}

      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        {abstract.isLoading || !built ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-20 h-10 min-w-56 border-b bg-muted px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
                    >
                      Section
                    </th>
                    {built.dias.map((d) => (
                      <th
                        key={d}
                        scope="col"
                        className="h-10 border-b bg-muted px-4 text-right text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
                      >
                        {parseFloat(d)} mm
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="sticky right-0 z-20 h-10 border-b bg-muted px-4 text-right text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
                    >
                      Total ({unit.toUpperCase()})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {built.rows.map((row, idx) => {
                    const total = Object.values(row.values).reduce((s, v) => s + v, 0)
                    const band = BAND_OF[row.code]
                    const bandStart = idx === 0 || BAND_OF[built.rows[idx - 1].code] !== band
                    const label = row.breakout ? (
                      <span className="pl-4 text-muted-foreground italic">{row.label}</span>
                    ) : (
                      <span className={cn("font-medium", row.computed && "text-info")}>
                        {row.code} · {row.label}
                        {row.computed && (
                          <span aria-hidden className="ml-1 text-[10px] text-muted-foreground">ⓕ</span>
                        )}
                      </span>
                    )
                    return (
                      <Fragment key={row.code}>
                      {bandStart && (
                        <tr className="bg-background">
                          <td
                            colSpan={built.dias.length + 2}
                            className="sticky left-0 h-7 border-b border-t px-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70"
                          >
                            {band}
                          </td>
                        </tr>
                      )}
                      <tr
                        className={cn(
                          "transition-colors odd:bg-row-stripe hover:bg-row-hover",
                          row.danger && "bg-danger-subtle font-semibold text-danger odd:bg-danger-subtle hover:bg-danger-subtle",
                          row.breakout && "text-[12px] text-muted-foreground",
                        )}
                      >
                        <td className={cn("sticky left-0 z-10 h-9 border-b bg-row-pinned px-4", row.danger && "bg-danger-subtle text-danger")}>
                          {row.formula ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/50">
                                  {label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right">{row.formula}</TooltipContent>
                            </Tooltip>
                          ) : (
                            label
                          )}
                        </td>
                        {built.dias.map((d) => {
                          // Wastage row (L): tint each cell by how much of the
                          // total wastage sits in that diameter, so the worst
                          // offenders pop without reading every number.
                          const v = row.values[d]
                          const isL = row.code === "L"
                          const share = isL && total > 0 && v != null && v > 0 ? v / total : 0
                          return (
                            <td
                              key={d}
                              className="tnum relative h-9 border-b px-4 text-right"
                              style={
                                isL && share > 0
                                  ? { background: `color-mix(in srgb, var(--warning) ${Math.round(share * 55)}%, transparent)` }
                                  : undefined
                              }
                            >
                              {row.scalar !== undefined ? "—" : fmt(row.values[d], unit)}
                            </td>
                          )
                        })}
                        <td className={cn("tnum sticky right-0 z-10 h-9 border-b bg-row-pinned px-4 text-right font-semibold", row.danger && "bg-danger-subtle text-danger")}>
                          {row.code === "M"
                            ? row.scalar
                            : row.code === "N"
                              ? fmt(scrapKg, unit)
                              : fmt(total, unit)}
                        </td>
                      </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </TooltipProvider>
        )}
        <div className="flex items-center gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>ⓕ = computed — hover the row label for its formula</span>
          <span className="flex-1" />
          {abstract.data && <span className="tnum">{abstract.data.pipeline_version}</span>}
        </div>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Jump to a month</DialogTitle>
            <DialogDescription>
              Only months with real ledger activity for this project can be viewed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={String(pickerMonth)}
              onValueChange={(v) => setPickerMonth(parseInt(v, 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptionsForPickerYear.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)} disabled={m.disabled}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(pickerYear)}
              onValueChange={(v) => setPickerYear(parseInt(v, 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-hover"
              disabled={monthOptionsForPickerYear.find((m) => m.value === pickerMonth)?.disabled}
              onClick={applyPicker}
            >
              Go
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title={`Finalize ${periodLabel}?`}
        description="The Abstract is snapshotted immutably and the month locks against further entries."
        confirmLabel="Finalize month"
        pending={finalize.isPending}
        onConfirm={() => {
          setActionError(null)
          finalize.mutate(
            { year, month },
            {
              onSuccess: () => {
                setFinalizeOpen(false)
                toast.success(`${periodLabel} finalized.`)
              },
              onError: (err) => {
                setFinalizeOpen(false)
                setActionError(apiErrorMessage(err, "Could not finalize the month."))
              },
            },
          )
        }}
      />
      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${periodLabel}?`}
        description="The finalized figures unlock; a new snapshot is created on re-finalize. The original snapshot is retained."
        confirmLabel="Reopen month"
        destructive
        requireReason
        reasonLabel="Reason for reopening"
        pending={reopen.isPending}
        onConfirm={(reason) => {
          setActionError(null)
          reopen.mutate(
            { year, month, reason: reason! },
            {
              onSuccess: () => {
                setReopenOpen(false)
                toast(`${periodLabel} reopened.`)
              },
              onError: (err) => {
                setReopenOpen(false)
                setActionError(apiErrorMessage(err, "Could not reopen the month."))
              },
            },
          )
        }}
      />
    </Page>
  )
}
