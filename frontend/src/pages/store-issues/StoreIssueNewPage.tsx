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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useContractors, useCreateStoreIssue, useDiaGrades, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

/**
 * Store Issue entry — the invariant's front door.
 * Advisory mode: the backend saves and returns `warning` (surfaced as a toast
 * + list flag). Blocking mode: a 422 names the exact constraint in the banner.
 */
export function StoreIssueNewPage() {
  const navigate = useNavigate()
  const contractors = useContractors()
  const dias = useDiaGrades()
  const createIssue = useCreateStoreIssue()

  const [direction, setDirection] = useState<"out" | "in">("out")
  const [contractorId, setContractorId] = useState("")
  const [diaId, setDiaId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [issuingStaff, setIssuingStaff] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!contractorId) errs.contractor_id = "Select the contractor."
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    if (!quantity || parseFloat(quantity) <= 0) errs.quantity_kg = "Enter the quantity in kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      const created = await createIssue.mutateAsync({
        contractor_id: contractorId,
        dia_grade_id: diaId,
        quantity_kg: quantity,
        direction,
        issuing_staff: issuingStaff.trim() || null,
        effective_date: effectiveDate,
      })
      toast.success(direction === "out" ? "Issue recorded." : "Return recorded.")
      if (created.warning) {
        toast.warning(created.warning, { duration: 8000 })
      }
      navigate("/store-issues")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not record the issue."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record Store Issue"
        description="Issue steel to a contractor, or record a return to store. Availability is checked against the shared store pool."
        actions={
          <Button variant="outline" asChild>
            <Link to="/store-issues">
              <ArrowLeft /> Back to list
            </Link>
          </Button>
        }
      />

      <Card className="max-w-[640px] shadow-(--shadow-card)">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {banner && <Banner variant="blocking">{banner}</Banner>}

            <Field
              label="Direction"
              required
              render={() => (
                <Tabs value={direction} onValueChange={(v) => setDirection(v as "out" | "in")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="out" className="flex-1">
                      Issue to contractor
                    </TabsTrigger>
                    <TabsTrigger value="in" className="flex-1">
                      Return to store
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

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

            <Field
              label="Quantity (kg)"
              required
              error={fieldErrors.quantity_kg}
              description={
                direction === "out"
                  ? "Checked against available stock for this diameter — over-stock issues are flagged (or rejected once blocking)."
                  : undefined
              }
              render={(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="tnum"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 4200.00"
                />
              )}
            />

            <Field
              label="Issuing staff"
              error={fieldErrors.issuing_staff}
              render={(p) => (
                <Input
                  {...p}
                  value={issuingStaff}
                  onChange={(e) => setIssuingStaff(e.target.value)}
                  placeholder="Who handed it over"
                />
              )}
            />

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
                disabled={createIssue.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createIssue.isPending ? "Saving…" : direction === "out" ? "Record issue" : "Record return"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/store-issues">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
