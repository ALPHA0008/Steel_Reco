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
import { useCreateTransfer, useDiaGrades, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function TransferNewPage() {
  const navigate = useNavigate()
  const dias = useDiaGrades()
  const createTransfer = useCreateTransfer()

  const [flag, setFlag] = useState<"loan" | "return">("loan")
  const [recordSource, setRecordSource] = useState<"sap" | "excel">("sap")
  const [toProjectId, setToProjectId] = useState("")
  const [diaId, setDiaId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [hoApprovalRef, setHoApprovalRef] = useState("")
  const [expectedReturn, setExpectedReturn] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!UUID_RE.test(toProjectId.trim())) errs.to_project_id = "Enter the target project's ID (UUID from HO)."
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    if (!quantity || parseFloat(quantity) <= 0) errs.quantity_kg = "Enter the quantity in kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      const created = await createTransfer.mutateAsync({
        to_project_id: toProjectId.trim(),
        dia_grade_id: diaId,
        quantity_kg: quantity,
        flag,
        record_source: recordSource,
        ho_approval_ref: hoApprovalRef.trim() || null,
        expected_return_date: expectedReturn || null,
        effective_date: effectiveDate,
      })
      // A loan-out exceeding available stock saves but is flagged (advisory) —
      // surface it like the store-issue / JMR forms do, don't swallow it.
      if (created?.warning) {
        toast.warning(created.warning)
      } else {
        toast.success("Transfer recorded.")
      }
      navigate("/transfers")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not record the transfer."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record Transfer"
        description="A loan to another site, or a return of previously loaned steel."
        actions={
          <Button variant="outline" asChild>
            <Link to="/transfers">
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
              label="Type"
              required
              render={() => (
                <Tabs value={flag} onValueChange={(v) => setFlag(v as "loan" | "return")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="loan" className="flex-1">Loan out</TabsTrigger>
                    <TabsTrigger value="return" className="flex-1">Return</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

            <Field
              label="Target project ID"
              required
              error={fieldErrors.to_project_id}
              description="The receiving project's ID — from the HO approval note. (A project picker is planned once a projects directory endpoint exists.)"
              render={(p) => (
                <Input
                  {...p}
                  value={toProjectId}
                  onChange={(e) => setToProjectId(e.target.value)}
                  placeholder="e.g. 9f4c1a2b-…"
                  className="tnum"
                />
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
                  placeholder="e.g. 2100.00"
                />
              )}
            />

            <Field
              label="Record source"
              required
              render={() => (
                <Tabs value={recordSource} onValueChange={(v) => setRecordSource(v as "sap" | "excel")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="sap" className="flex-1">SAP</TabsTrigger>
                    <TabsTrigger value="excel" className="flex-1">Excel</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

            <Field
              label="HO approval reference"
              error={fieldErrors.ho_approval_ref}
              description="Leave blank only if approval is pending — the transfer stays traceable either way."
              render={(p) => (
                <Input
                  {...p}
                  value={hoApprovalRef}
                  onChange={(e) => setHoApprovalRef(e.target.value)}
                  placeholder="e.g. HO/2026/0412"
                />
              )}
            />

            {flag === "loan" && (
              <Field
                label="Expected return date"
                error={fieldErrors.expected_return_date}
                render={(p) => (
                  <Input
                    {...p}
                    type="date"
                    className="tnum"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                  />
                )}
              />
            )}

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
                disabled={createTransfer.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createTransfer.isPending ? "Saving…" : "Record transfer"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/transfers">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
