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
import { useCreateMyHomeStock, useDiaGrades, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

export function MyHomeStockNewPage() {
  const navigate = useNavigate()
  const dias = useDiaGrades()
  const createStock = useCreateMyHomeStock()

  const [diaId, setDiaId] = useState("")
  const [qtyKg, setQtyKg] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    if (!qtyKg || parseFloat(qtyKg) < 0) errs.qty_kg = "Enter the current quantity in kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      await createStock.mutateAsync({
        dia_grade_id: diaId,
        qty_kg: qtyKg,
        effective_date: effectiveDate,
        notes: notes.trim() || null,
      })
      toast.success("My Home stock recorded.")
      navigate("/myhome-stock")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not record the stock snapshot."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record Stock at My Home"
        description="A snapshot of what's currently sitting at the yard for one diameter. Only the latest entry per diameter counts."
        actions={
          <Button variant="outline" asChild>
            <Link to="/myhome-stock">
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
                label="Current quantity (kg)"
                required
                error={fieldErrors.qty_kg}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={qtyKg}
                    onChange={(e) => setQtyKg(e.target.value)}
                  />
                )}
              />
            </div>

            <Field
              label="Notes"
              error={fieldErrors.notes}
              render={(p) => (
                <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              )}
            />

            <Field
              label="As-of date"
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
                disabled={createStock.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createStock.isPending ? "Saving…" : "Record stock"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/myhome-stock">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
