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
  useCreateBbsPlan,
  useDiaGrades,
  useFloors,
  useTowers,
  diaLabel,
} from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

export function BbsNewPage() {
  const navigate = useNavigate()
  const towers = useTowers()
  const dias = useDiaGrades()
  const contractors = useContractors()
  const createPlan = useCreateBbsPlan()

  const [towerId, setTowerId] = useState("")
  const floors = useFloors(towerId || undefined)
  const [floorId, setFloorId] = useState("")
  const [barMark, setBarMark] = useState("")
  const [pourDescription, setPourDescription] = useState("")
  const [diaId, setDiaId] = useState("")
  const [plannedWeight, setPlannedWeight] = useState("")
  const [drawingRef, setDrawingRef] = useState("")
  const [contractorId, setContractorId] = useState("")

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
    if (!plannedWeight || parseFloat(plannedWeight) <= 0)
      errs.planned_weight_kg = "Enter the planned weight in kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      await createPlan.mutateAsync({
        tower_id: towerId,
        floor_id: floorId,
        bar_mark: barMark.trim() || null,
        pour_description: pourDescription.trim() || null,
        dia_grade_id: diaId,
        planned_weight_kg: plannedWeight,
        drawing_ref: drawingRef.trim() || null,
        contractor_id: contractorId || null,
      })
      toast.success("BBS row added.")
      navigate("/bbs")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not add the BBS row."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Add BBS Row"
        description="A planned bar-mark quantity from the bar bending schedule."
        actions={
          <Button variant="outline" asChild>
            <Link to="/bbs">
              <ArrowLeft /> Back to list
            </Link>
          </Button>
        }
      />

      <Card className="max-w-[640px] shadow-(--shadow-card)">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {banner && <Banner variant="blocking">{banner}</Banner>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Bar mark"
                error={fieldErrors.bar_mark}
                render={(p) => (
                  <Input {...p} value={barMark} onChange={(e) => setBarMark(e.target.value)} placeholder="e.g. C-12" />
                )}
              />
              <Field
                label="Pour description"
                error={fieldErrors.pour_description}
                render={(p) => (
                  <Input
                    {...p}
                    value={pourDescription}
                    onChange={(e) => setPourDescription(e.target.value)}
                    placeholder="e.g. Columns"
                  />
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
              label="Planned weight (kg)"
              required
              error={fieldErrors.planned_weight_kg}
              render={(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="tnum"
                  value={plannedWeight}
                  onChange={(e) => setPlannedWeight(e.target.value)}
                  placeholder="e.g. 1240.50"
                />
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Drawing ref."
                error={fieldErrors.drawing_ref}
                render={(p) => (
                  <Input {...p} value={drawingRef} onChange={(e) => setDrawingRef(e.target.value)} />
                )}
              />
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
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={createPlan.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createPlan.isPending ? "Saving…" : "Add BBS row"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/bbs">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
