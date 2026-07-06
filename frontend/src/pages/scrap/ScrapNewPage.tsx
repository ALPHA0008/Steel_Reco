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
import { useCreateScrapSale } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

export function ScrapNewPage() {
  const navigate = useNavigate()
  const createSale = useCreateScrapSale()

  const [buyerName, setBuyerName] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [ratePerKg, setRatePerKg] = useState("")
  const [gatePassNo, setGatePassNo] = useState("")
  const [invoiceRef, setInvoiceRef] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Computed live, never typed — the DB's GENERATED column is the real source.
  const total =
    weightKg && ratePerKg
      ? (parseFloat(weightKg) * parseFloat(ratePerKg)).toLocaleString("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        })
      : "—"

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!buyerName.trim()) errs.buyer_name = "Enter the buyer's name."
    if (!weightKg || parseFloat(weightKg) <= 0) errs.weight_kg = "Enter the weight in kg."
    if (!ratePerKg || parseFloat(ratePerKg) <= 0) errs.rate_per_kg = "Enter the rate per kg."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      await createSale.mutateAsync({
        buyer_name: buyerName.trim(),
        weight_kg: weightKg,
        rate_per_kg: ratePerKg,
        gate_pass_no: gatePassNo.trim() || null,
        invoice_ref: invoiceRef.trim() || null,
        effective_date: effectiveDate,
      })
      toast.success("Scrap sale recorded.")
      navigate("/scrap")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not record the sale."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record Scrap Sale"
        description="A sale out of the scrap yard. The total is computed — never typed."
        actions={
          <Button variant="outline" asChild>
            <Link to="/scrap">
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
              label="Buyer"
              required
              error={fieldErrors.buyer_name}
              render={(p) => (
                <Input
                  {...p}
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="e.g. Sri Balaji Traders"
                />
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Weight (kg)"
                required
                error={fieldErrors.weight_kg}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                  />
                )}
              />
              <Field
                label="Rate (₹/kg)"
                required
                error={fieldErrors.rate_per_kg}
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={ratePerKg}
                    onChange={(e) => setRatePerKg(e.target.value)}
                  />
                )}
              />
            </div>

            <Field
              label="Total amount"
              description="weight × rate — computed by the database, shown here for confirmation."
              render={(p) => <Input {...p} readOnly value={total} className="tnum bg-muted" />}
            />

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Gate pass no."
                error={fieldErrors.gate_pass_no}
                render={(p) => (
                  <Input {...p} value={gatePassNo} onChange={(e) => setGatePassNo(e.target.value)} />
                )}
              />
              <Field
                label="Invoice ref."
                error={fieldErrors.invoice_ref}
                render={(p) => (
                  <Input {...p} value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
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
                disabled={createSale.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createSale.isPending ? "Saving…" : "Record sale"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/scrap">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
