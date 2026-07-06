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
import { useCreatePurchaseOrder, useDiaGrades, useVendors, diaLabel } from "@/lib/queries"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api"

interface LineRow {
  dia_grade_id: string
  ordered_qty_kg: string
  rate_per_kg: string
}

export function PurchaseOrderNewPage() {
  const navigate = useNavigate()
  const vendors = useVendors()
  const dias = useDiaGrades()
  const createPo = useCreatePurchaseOrder()

  const [poNumber, setPoNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<LineRow[]>([{ dia_grade_id: "", ordered_qty_kg: "", rate_per_kg: "" }])

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
    if (!poNumber.trim()) errs.po_number = "Enter the PO number."
    if (!vendorId) errs.vendor_id = "Select the vendor."

    const lErrs: Record<number, string> = {}
    lines.forEach((l, i) => {
      if (!l.dia_grade_id) lErrs[i] = "Select the diameter."
      else if (!l.ordered_qty_kg || parseFloat(l.ordered_qty_kg) <= 0) lErrs[i] = "Enter the ordered quantity in kg."
    })

    if (Object.keys(errs).length > 0 || Object.keys(lErrs).length > 0) {
      setFieldErrors(errs)
      setLineErrors(lErrs)
      return
    }

    try {
      await createPo.mutateAsync({
        po_number: poNumber.trim(),
        vendor_id: vendorId,
        order_date: orderDate,
        lines: lines.map((l) => ({
          dia_grade_id: l.dia_grade_id,
          ordered_qty_kg: l.ordered_qty_kg,
          rate_per_kg: l.rate_per_kg.trim() || null,
        })),
      })
      toast.success("Purchase order added.")
      navigate("/purchase-orders")
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      setBanner(apiErrorMessage(err, "Could not add the purchase order."))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Add Purchase Order"
        description="The contractual quantity, dia-wise — the anchor incoming GRNs are checked against."
        actions={
          <Button variant="outline" asChild>
            <Link to="/purchase-orders">
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
                label="PO number"
                required
                error={fieldErrors.po_number}
                render={(p) => (
                  <Input {...p} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-1187" />
                )}
              />
              <Field
                label="Order date"
                required
                error={fieldErrors.order_date}
                render={(p) => (
                  <Input {...p} type="date" className="tnum" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                )}
              />
            </div>

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

            <Separator />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Dia-wise lines</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((rows) => [...rows, { dia_grade_id: "", ordered_qty_kg: "", rate_per_kg: "" }])}
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
                        label="Ordered (kg)"
                        render={(p) => (
                          <Input
                            {...p}
                            type="number"
                            min="0"
                            step="0.01"
                            className="tnum"
                            value={line.ordered_qty_kg}
                            onChange={(e) => updateLine(i, { ordered_qty_kg: e.target.value })}
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
                disabled={createPo.isPending}
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {createPo.isPending ? "Saving…" : "Add purchase order"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/purchase-orders">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  )
}
