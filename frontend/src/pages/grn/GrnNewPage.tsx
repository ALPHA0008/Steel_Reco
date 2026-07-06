import { useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  useCreateGrn,
  useDiaGrades,
  usePurchaseOrders,
  useSupplierInvoices,
  useVendors,
  diaLabel,
} from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"
import type { ReceiptType } from "@/lib/types"

/**
 * GRN entry — the vertical-slice form (design.md §9.5):
 * single column ≤640px, labels above, inline 422 field errors,
 * top-of-form blocking banner, advisory handling, redundant-entry avoided
 * (project/period come from context, never asked).
 *
 * Since the upstream-document capture (plan §3.5), a GRN can link a PO +
 * Supplier Invoice + weighbridge slip (gross/tare) — the anchors the
 * inbound-reconciliation rule checks it against. All three stay optional:
 * a GRN with none of them still saves, just unreconciled (advisory, not
 * blocked) — the tool trusts nothing outright, but never gates a receipt
 * on paperwork the site doesn't have yet.
 */
export function GrnNewPage() {
  const navigate = useNavigate()
  const vendors = useVendors()
  const dias = useDiaGrades()
  const purchaseOrders = usePurchaseOrders()
  const invoices = useSupplierInvoices()
  const createGrn = useCreateGrn()

  const [receiptType, setReceiptType] = useState<ReceiptType>("against_po")
  const [vendorId, setVendorId] = useState("")
  const [diaId, setDiaId] = useState("")
  const [poId, setPoId] = useState("")
  const [invoiceId, setInvoiceId] = useState("")
  const [poReference, setPoReference] = useState("")
  const [sourceSite, setSourceSite] = useState("")
  const [grossWeight, setGrossWeight] = useState("")
  const [tareWeight, setTareWeight] = useState("")
  const [manualWeight, setManualWeight] = useState("")
  const [gateEntryAt, setGateEntryAt] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16) // datetime-local format
  })
  const [notes, setNotes] = useState("")

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isOtherSite = receiptType !== "against_po"

  // Redundant-entry avoidance (WCAG 3.3.7, brandguidelines §12): once both
  // slip weights are known, net is derived — never re-typed.
  const hasSlip = grossWeight !== "" && tareWeight !== ""
  const slipNet = hasSlip ? Math.max(0, parseFloat(grossWeight) - parseFloat(tareWeight)) : null
  const weightKg = hasSlip ? (slipNet ?? 0).toFixed(2) : manualWeight

  const vendorPos = useMemo(
    () => (vendorId ? (purchaseOrders.data ?? []).filter((p) => p.vendor_id === vendorId) : purchaseOrders.data ?? []),
    [purchaseOrders.data, vendorId],
  )
  const vendorInvoices = useMemo(
    () => (vendorId ? (invoices.data ?? []).filter((i) => i.vendor_id === vendorId) : invoices.data ?? []),
    [invoices.data, vendorId],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})

    // Client-side mirror of the schema's required checks — clean messages first.
    const errs: Record<string, string> = {}
    if (!vendorId) errs.vendor_id = "Select the vendor."
    if (!diaId) errs.dia_grade_id = "Select the diameter grade."
    if (!weightKg || parseFloat(weightKg) <= 0) errs.weighbridge_weight_kg = "Enter the net weight in kg."
    if (isOtherSite && !sourceSite.trim()) errs.source_site = "Name the site this steel came from."
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    try {
      const grn = await createGrn.mutateAsync({
        vendor_id: vendorId,
        dia_grade_id: diaId,
        receipt_type: receiptType,
        po_id: poId || null,
        supplier_invoice_id: invoiceId || null,
        po_reference: poReference.trim() || null,
        source_site: isOtherSite ? sourceSite.trim() : null,
        weighbridge_weight_kg: weightKg,
        gross_weight_kg: hasSlip ? grossWeight : null,
        tare_weight_kg: hasSlip ? tareWeight : null,
        gate_entry_at: new Date(gateEntryAt).toISOString(),
        notes: notes.trim() || null,
      })
      toast.success("GRN saved.")
      if (grn.warning) {
        toast.warning(grn.warning, { duration: 8000 })
      }
      navigate("/grn")
    } catch (err) {
      const fields = apiFieldErrors(err)
      setFieldErrors(fields)
      setBanner(apiErrorMessage(err, "Could not save the GRN."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Record GRN"
        description="A goods receipt into the store. Link its PO and invoice where available — they're what let the tool prove this receipt, not just record it."
        actions={
          <Button variant="outline" asChild>
            <Link to="/grn">
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
              label="Receipt type"
              required
              render={() => (
                <Tabs value={receiptType} onValueChange={(v) => setReceiptType(v as ReceiptType)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="against_po" className="flex-1">
                      Against PO
                    </TabsTrigger>
                    <TabsTrigger value="other_site_sap" className="flex-1">
                      Other site (SAP)
                    </TabsTrigger>
                    <TabsTrigger value="other_site_excel" className="flex-1">
                      Other site (Excel)
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

            <Field
              label="Vendor"
              required
              error={fieldErrors.vendor_id}
              render={(p) => (
                <Select
                  value={vendorId}
                  onValueChange={(v) => {
                    setVendorId(v)
                    setPoId("")
                    setInvoiceId("")
                  }}
                >
                  <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} className="w-full">
                    <SelectValue placeholder={vendors.isLoading ? "Loading…" : "Select vendor"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(vendors.data ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
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

            {isOtherSite && (
              <Field
                label="Source site"
                required
                error={fieldErrors.source_site}
                description="The project this steel was transferred from."
                render={(p) => (
                  <Input
                    {...p}
                    value={sourceSite}
                    onChange={(e) => setSourceSite(e.target.value)}
                    placeholder="e.g. Grava Residences"
                  />
                )}
              />
            )}

            <Separator />

            <div>
              <h3 className="mb-1 text-sm font-semibold">Reconciliation anchors</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Optional, but this is what lets the tool validate the receipt instead of just recording it.
                Leave blank if the document isn't available yet — the GRN still saves, flagged for follow-up.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Purchase order"
                  render={(p) => (
                    <Select value={poId} onValueChange={setPoId}>
                      <SelectTrigger id={p.id} className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorPos.map((po) => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.po_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Field
                  label="Supplier invoice"
                  render={(p) => (
                    <Select value={invoiceId} onValueChange={setInvoiceId}>
                      <SelectTrigger id={p.id} className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorInvoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {!isOtherSite && (
                <Field
                  className="mt-4"
                  label="PO reference (free text)"
                  error={fieldErrors.po_reference}
                  description="Only if the PO above isn't in the system yet."
                  render={(p) => (
                    <Input
                      {...p}
                      value={poReference}
                      onChange={(e) => setPoReference(e.target.value)}
                      placeholder="e.g. PO-1187"
                    />
                  )}
                />
              )}
            </div>

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold">Weighing</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Gross weight (kg)"
                  description="From the weighbridge slip."
                  render={(p) => (
                    <Input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="tnum"
                      value={grossWeight}
                      onChange={(e) => setGrossWeight(e.target.value)}
                    />
                  )}
                />
                <Field
                  label="Tare weight (kg)"
                  render={(p) => (
                    <Input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="tnum"
                      value={tareWeight}
                      onChange={(e) => setTareWeight(e.target.value)}
                    />
                  )}
                />
              </div>

              <Field
                className="mt-4"
                label="Net weight (kg)"
                required
                error={fieldErrors.weighbridge_weight_kg}
                description={
                  hasSlip
                    ? "Computed from gross − tare above."
                    : "Enter directly if the weighbridge slip isn't split into gross/tare."
                }
                render={(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="tnum"
                    value={weightKg}
                    onChange={(e) => setManualWeight(e.target.value)}
                    readOnly={hasSlip}
                    disabled={hasSlip}
                    placeholder="e.g. 16440.00"
                  />
                )}
              />
            </div>

            <Field
              label="Gate entry"
              required
              error={fieldErrors.gate_entry_at}
              render={(p) => (
                <Input
                  {...p}
                  type="datetime-local"
                  className="tnum"
                  value={gateEntryAt}
                  onChange={(e) => setGateEntryAt(e.target.value)}
                />
              )}
            />

            <Field
              label="Notes"
              error={fieldErrors.notes}
              render={(p) => (
                <Textarea
                  {...p}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything worth recording about this receipt"
                />
              )}
            />

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={createGrn.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createGrn.isPending ? "Saving…" : "Save GRN"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/grn">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
