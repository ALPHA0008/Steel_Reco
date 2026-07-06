import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Field } from "@/components/app/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useContractors,
  useCreateJmrActual,
  useDiaGrades,
  useFloors,
  useTowers,
  diaLabel,
} from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

export function JmrNewPage() {
  const navigate = useNavigate()
  const towers = useTowers()
  const dias = useDiaGrades()
  const contractors = useContractors()
  const createJmr = useCreateJmrActual()

  const [towerId, setTowerId] = useState("")
  const floors = useFloors(towerId || undefined)
  const [floorId, setFloorId] = useState("")
  const [barMark, setBarMark] = useState("")
  const [pourNumber, setPourNumber] = useState("")
  const [diaId, setDiaId] = useState("")
  const [measuredWeight, setMeasuredWeight] = useState("")
  const [drawingRef, setDrawingRef] = useState("")
  const [contractorId, setContractorId] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!towerId) errs.tower_id = "Select the tower."
    if (!floorId) errs.floor_id = "Select the floor."
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    if (!measuredWeight || parseFloat(measuredWeight) <= 0)
      errs.measured_weight_kg = "Enter the measured weight in kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      await createJmr.mutateAsync({
        tower_id: towerId,
        floor_id: floorId,
        bar_mark: barMark.trim() || null,
        dia_grade_id: diaId,
        measured_weight_kg: measuredWeight,
        contractor_id: contractorId || null,
        pour_number: pourNumber.trim() || null,
        drawing_ref: drawingRef.trim() || null,
        effective_date: effectiveDate,
      })
      toast.success("JMR row added.")
      navigate("/jmr")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not add the JMR row."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Add JMR Row"
        description="A jointly measured quantity, signed by QS and contractor."
        actions={
          <Button variant="outline" asChild>
            <Link to="/jmr">
              <ArrowLeft /> Back to list
            </Link>
          </Button>
        }
      />

      <Card className="max-w-[640px] shadow-(--shadow-card)">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {banner && <Banner variant="blocking">{banner}</Banner>}

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Tower"
                required
                error={fieldErrors.tower_id}
                render={(p) => (
                  <Select
                    value={towerId}
                    onValueChange={(v) => {
                      setTowerId(v)
                      setFloorId("")
                    }}
                  >
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} className="w-full">
                      <SelectValue placeholder={towers.isLoading ? "Loading…" : "Select tower"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(towers.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Field
                label="Floor"
                required
                error={fieldErrors.floor_id}
                render={(p) => (
                  <Select value={floorId} onValueChange={setFloorId} disabled={!towerId}>
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} className="w-full">
                      <SelectValue
                        placeholder={!towerId ? "Pick a tower first" : floors.isLoading ? "Loading…" : "Select floor"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(floors.data ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.level_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Pour number"
                error={fieldErrors.pour_number}
                render={(p) => (
                  <Input {...p} value={pourNumber} onChange={(e) => setPourNumber(e.target.value)} placeholder="e.g. P-104" />
                )}
              />
              <Field
                label="Bar mark"
                error={fieldErrors.bar_mark}
                render={(p) => (
                  <Input {...p} value={barMark} onChange={(e) => setBarMark(e.target.value)} placeholder="Optional" />
                )}
              />
            </div>

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

            <Field
              label="Measured weight (kg)"
              required
              error={fieldErrors.measured_weight_kg}
              render={(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="tnum"
                  value={measuredWeight}
                  onChange={(e) => setMeasuredWeight(e.target.value)}
                  placeholder="e.g. 860.00"
                />
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Contractor"
                error={fieldErrors.contractor_id}
                render={(p) => (
                  <Select value={contractorId} onValueChange={setContractorId}>
                    <SelectTrigger id={p.id} className="w-full">
                      <SelectValue placeholder="Optional" />
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
                label="Drawing ref."
                error={fieldErrors.drawing_ref}
                render={(p) => (
                  <Input {...p} value={drawingRef} onChange={(e) => setDrawingRef(e.target.value)} />
                )}
              />
            </div>

            <Field
              label="Date"
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
                disabled={createJmr.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createJmr.isPending ? "Saving…" : "Add JMR row"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/jmr">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
