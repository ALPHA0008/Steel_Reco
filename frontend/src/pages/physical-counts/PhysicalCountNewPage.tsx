import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Field } from "@/components/app/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useContractors, useCreatePhysicalCount, useDiaGrades, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"
import type { CutPieceClassification } from "@/lib/types"

interface CutRow {
  length_mm: string
  nos: string
  weight_kg: string
  classification: CutPieceClassification | ""
}

const CLASS_LABELS: Record<CutPieceClassification, string> = {
  reusable: "Reusable",
  used_as_safety_steel: "Used as safety steel",
  scrap: "Scrap",
}

/**
 * Physical Count entry. Cut pieces are the biggest historical leak — every
 * row must be classified, and pieces ≤ 1.5 m are scrap by rule. The UI
 * enforces it up front; the DB CHECK is the real guard behind it.
 */
export function PhysicalCountNewPage() {
  const navigate = useNavigate()
  const contractors = useContractors()
  const dias = useDiaGrades()
  const createCount = useCreatePhysicalCount()

  const [contractorId, setContractorId] = useState("")
  const [diaId, setDiaId] = useState("")
  const [bundleCount, setBundleCount] = useState("0")
  const [bundleWeight, setBundleWeight] = useState("")
  const [looseCount, setLooseCount] = useState("0")
  const [rodWeight, setRodWeight] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cutRows, setCutRows] = useState<CutRow[]>([])

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [cutErrors, setCutErrors] = useState<Record<number, string>>({})

  function updateCutRow(i: number, patch: Partial<CutRow>) {
    setCutRows((rows) => {
      const next = rows.slice()
      const row = { ...next[i], ...patch }
      // ≤ 1.5 m must be scrap — force it the moment length says so.
      const len = parseInt(row.length_mm, 10)
      if (!Number.isNaN(len) && len > 0 && len <= 1500) row.classification = "scrap"
      next[i] = row
      return next
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})
    setCutErrors({})

    const errs: Record<string, string> = {}
    if (!contractorId) errs.contractor_id = "Select the contractor."
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    const bundles = parseInt(bundleCount || "0", 10)
    const loose = parseInt(looseCount || "0", 10)
    if (bundles > 0 && (!bundleWeight || parseFloat(bundleWeight) <= 0))
      errs.each_bundle_weight_kg = "Weight per bundle is required when bundles are counted."
    if (loose > 0 && (!rodWeight || parseFloat(rodWeight) <= 0))
      errs.each_rod_weight_kg = "Weight per rod is required when loose rods are counted."

    const cErrs: Record<number, string> = {}
    cutRows.forEach((row, i) => {
      const len = parseInt(row.length_mm, 10)
      const nos = parseInt(row.nos, 10)
      if (Number.isNaN(len) || len <= 0) cErrs[i] = "Enter the piece length in mm."
      else if (Number.isNaN(nos) || nos <= 0) cErrs[i] = "Enter the number of pieces."
      else if (!row.weight_kg || parseFloat(row.weight_kg) <= 0) cErrs[i] = "Enter the total weight in kg."
      else if (!row.classification) cErrs[i] = "Classify this piece — unclassified pieces cannot be saved."
      else if (len <= 1500 && row.classification !== "scrap")
        cErrs[i] = "Pieces of 1.5 m or less must be classified as scrap."
    })

    if (Object.keys(errs).length > 0 || Object.keys(cErrs).length > 0) {
      setFieldErrors(errs)
      setCutErrors(cErrs)
      return
    }

    try {
      await createCount.mutateAsync({
        contractor_id: contractorId,
        dia_grade_id: diaId,
        bundle_count: bundles,
        each_bundle_weight_kg: bundles > 0 ? bundleWeight : null,
        loose_rod_count: loose,
        each_rod_weight_kg: loose > 0 ? rodWeight : null,
        effective_date: effectiveDate,
        cut_pieces: cutRows.map((r) => ({
          length_mm: parseInt(r.length_mm, 10),
          nos: parseInt(r.nos, 10),
          weight_kg: r.weight_kg,
          classification: r.classification as CutPieceClassification,
        })),
      })
      toast.success("Physical count recorded.")
      navigate("/physical-counts")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not record the count."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record Physical Count"
        description="Counted stock for one contractor and diameter. Every cut piece must be classified — ≤ 1.5 m is scrap by rule."
        actions={
          <Button variant="outline" asChild>
            <Link to="/physical-counts">
              <ArrowLeft /> Back to list
            </Link>
          </Button>
        }
      />

      <Card className="max-w-[720px] shadow-(--shadow-card)">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {banner && <Banner variant="blocking">{banner}</Banner>}

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Contractor"
                required
                error={fieldErrors.contractor_id}
                render={(p) => (
                  <Select value={contractorId} onValueChange={setContractorId}>
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} className="w-full">
                      <SelectValue placeholder={contractors.isLoading ? "Loading…" : "Select contractor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(contractors.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Field
                label="Diameter grade"
                required
                error={fieldErrors.dia_grade_id}
                render={(p) => (
                  <Select value={diaId} onValueChange={setDiaId}>
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} className="w-full">
                      <SelectValue placeholder={dias.isLoading ? "Loading…" : "Select diameter"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(dias.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {diaLabel(d)} · {d.grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Full bundles"
                error={fieldErrors.bundle_count}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    min="0"
                    step="1"
                    className="tnum"
                    value={bundleCount}
                    onChange={(e) => setBundleCount(e.target.value)}
                  />
                )}
              />
              <Field
                label="Weight per bundle (kg)"
                required={parseInt(bundleCount || "0", 10) > 0}
                error={fieldErrors.each_bundle_weight_kg}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={bundleWeight}
                    onChange={(e) => setBundleWeight(e.target.value)}
                    disabled={parseInt(bundleCount || "0", 10) === 0}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Loose rods"
                error={fieldErrors.loose_rod_count}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    min="0"
                    step="1"
                    className="tnum"
                    value={looseCount}
                    onChange={(e) => setLooseCount(e.target.value)}
                  />
                )}
              />
              <Field
                label="Weight per rod (kg)"
                required={parseInt(looseCount || "0", 10) > 0}
                error={fieldErrors.each_rod_weight_kg}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={rodWeight}
                    onChange={(e) => setRodWeight(e.target.value)}
                    disabled={parseInt(looseCount || "0", 10) === 0}
                  />
                )}
              />
            </div>

            <Separator />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Cut pieces</h3>
                  <p className="text-xs text-muted-foreground">
                    Every piece needs a classification. Lengths ≤ 1,500 mm are locked to scrap.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCutRows((rows) => [...rows, { length_mm: "", nos: "", weight_kg: "", classification: "" }])
                  }
                >
                  <Plus /> Add piece
                </Button>
              </div>

              {cutRows.length === 0 && (
                <p className="rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
                  No cut pieces this count — that's a valid state, not a gap.
                </p>
              )}

              <div className="space-y-3">
                {cutRows.map((row, i) => {
                  const len = parseInt(row.length_mm, 10)
                  const forcedScrap = !Number.isNaN(len) && len > 0 && len <= 1500
                  return (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-end gap-3">
                        <Field
                          label="Length (mm)"
                          render={(p) => (
                            <Input
                              {...p}
                              type="number"
                              min="0"
                              step="1"
                              className="tnum"
                              value={row.length_mm}
                              onChange={(e) => updateCutRow(i, { length_mm: e.target.value })}
                            />
                          )}
                        />
                        <Field
                          label="Nos"
                          render={(p) => (
                            <Input
                              {...p}
                              type="number"
                              min="0"
                              step="1"
                              className="tnum"
                              value={row.nos}
                              onChange={(e) => updateCutRow(i, { nos: e.target.value })}
                            />
                          )}
                        />
                        <Field
                          label="Weight (kg)"
                          render={(p) => (
                            <Input
                              {...p}
                              type="number"
                              min="0"
                              step="0.01"
                              className="tnum"
                              value={row.weight_kg}
                              onChange={(e) => updateCutRow(i, { weight_kg: e.target.value })}
                            />
                          )}
                        />
                        <Field
                          label="Classification"
                          render={(p) => (
                            <Select
                              value={row.classification}
                              onValueChange={(v) =>
                                updateCutRow(i, { classification: v as CutPieceClassification })
                              }
                              disabled={forcedScrap}
                            >
                              <SelectTrigger id={p.id} className="w-full">
                                <SelectValue placeholder={forcedScrap ? "Scrap (by rule)" : "Classify…"} />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(CLASS_LABELS) as CutPieceClassification[]).map((k) => (
                                  <SelectItem key={k} value={k}>
                                    {CLASS_LABELS[k]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove piece"
                          className="text-muted-foreground hover:text-danger"
                          onClick={() => setCutRows((rows) => rows.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {forcedScrap && row.classification === "scrap" && !cutErrors[i] && (
                        <p className="mt-2 text-xs font-medium text-warning">
                          ≤ 1.5 m — classified as scrap by rule.
                        </p>
                      )}
                      {cutErrors[i] && (
                        <p role="alert" className="mt-2 text-xs font-medium text-danger">
                          {cutErrors[i]}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <Separator />

            <Field
              label="Count date"
              required
              error={fieldErrors.effective_date}
              render={(p) => (
                <Input
                  {...p}
                  type="date"
                  className="tnum"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              )}
            />

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={createCount.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createCount.isPending ? "Saving…" : "Record count"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/physical-counts">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
