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
import { useCreateSupplierInvoice, useDiaGrades, usePurchaseOrders, useVendors, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

interface LineRow {
  dia_grade_id: string
  invoiced_qty_kg: string
  rate_per_kg: string
}

export function InvoiceNewPage() {
  const navigate = useNavigate()
  const vendors = useVendors()
  const dias = useDiaGrades()
  const pos = usePurchaseOrders()
  const createInvoice = useCreateSupplierInvoice()

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [poId, setPoId] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ewayBill, setEwayBill] = useState("")
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [lines, setLines] = useState<LineRow[]>([{ dia_grade_id: "", invoiced_qty_kg: "", rate_per_kg: "" }])

  const [banner, setBanner] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({})

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((rows) => {
      const next = rows.slice()
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setFieldErrors({})
    setLineErrors({})

    const errs: Record<string, string> = {}
    if (!invoiceNumber.trim()) errs.invoice_number = "Enter the invoice number."
    if (!vendorId) errs.vendor_id = "Select the vendor."

    const lErrs: Record<number, string> = {}
    lines.forEach((l, i) => {
      if (!l.dia_grade_id) lErrs[i] = "Select the diameter."
      else if (!l.invoiced_qty_kg || parseFloat(l.invoiced_qty_kg) <= 0)
        lErrs[i] = "Enter the invoiced quantity in kg."
    })

    if (Object.keys(errs).length > 0 || Object.keys(lErrs).length > 0) {
      setFieldErrors(errs)
      setLineErrors(lErrs)
      return
    }

    try {
      await createInvoice.mutateAsync({
        invoice_number: invoiceNumber.trim(),
        vendor_id: vendorId,
        po_id: poId || null,
        invoice_date: invoiceDate,
        eway_bill_number: ewayBill.trim() || null,
        vehicle_number: vehicleNumber.trim() || null,
        lines: lines.map((l) => ({
          dia_grade_id: l.dia_grade_id,
          invoiced_qty_kg: l.invoiced_qty_kg,
          rate_per_kg: l.rate_per_kg.trim() || null,
        })),
      })
      toast.success("Supplier invoice added.")
      navigate("/invoices")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not add the invoice."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Add Supplier Invoice"
        description="GST-tracked quantity — link it to a PO where one exists."
        actions={
          <Button variant="outline" asChild>
            <Link to="/invoices">
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
                label="Invoice number"
                required
                error={fieldErrors.invoice_number}
                render={(p) => (
                  <Input {...p} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-0412" />
                )}
              />
              <Field
                label="Invoice date"
                required
                error={fieldErrors.invoice_date}
                render={(p) => (
                  <Input {...p} type="date" className="tnum" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Vendor"
                required
                error={fieldErrors.vendor_id}
                render={(p) => (
                  <Select value={vendorId} onValueChange={setVendorId}>
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
                label="Purchase order"
                description="Optional — links this invoice to a PO for reconciliation."
                render={(p) => (
                  <Select value={poId} onValueChange={setPoId}>
                    <SelectTrigger id={p.id} className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {(pos.data ?? []).map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="E-way bill no."
                error={fieldErrors.eway_bill_number}
                render={(p) => (
                  <Input {...p} value={ewayBill} onChange={(e) => setEwayBill(e.target.value)} />
                )}
              />
              <Field
                label="Vehicle no."
                error={fieldErrors.vehicle_number}
                render={(p) => (
                  <Input {...p} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                )}
              />
            </div>

            <Separator />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Dia-wise lines</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((rows) => [...rows, { dia_grade_id: "", invoiced_qty_kg: "", rate_per_kg: "" }])
                  }
                >
                  <Plus /> Add line
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((line, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-end gap-3">
                      <Field
                        label="Diameter"
                        render={(p) => (
                          <Select value={line.dia_grade_id} onValueChange={(v) => updateLine(i, { dia_grade_id: v })}>
                            <SelectTrigger id={p.id} className="w-full">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(dias.data ?? []).map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {diaLabel(d)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <Field
                        label="Invoiced (kg)"
                        render={(p) => (
                          <Input
                            {...p}
                            type="number"
                            min="0"
                            step="0.01"
                            className="tnum"
                            value={line.invoiced_qty_kg}
                            onChange={(e) => updateLine(i, { invoiced_qty_kg: e.target.value })}
                          />
                        )}
                      />
                      <Field
                        label="Rate (₹/kg)"
                        render={(p) => (
                          <Input
                            {...p}
                            type="number"
                            min="0"
                            step="0.01"
                            className="tnum"
                            value={line.rate_per_kg}
                            onChange={(e) => updateLine(i, { rate_per_kg: e.target.value })}
                          />
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        className="text-muted-foreground hover:text-danger"
                        disabled={lines.length === 1}
                        onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {lineErrors[i] && (
                      <p role="alert" className="mt-2 text-xs font-medium text-danger">
                        {lineErrors[i]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={createInvoice.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createInvoice.isPending ? "Saving…" : "Add invoice"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/invoices">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
