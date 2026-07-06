import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Receipt } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { usePurchaseOrders, useSupplierInvoices, useVendors, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { SupplierInvoice } from "@/lib/types"

export function InvoiceListPage() {
  const invoices = useSupplierInvoices()
  const vendors = useVendors()
  const pos = usePurchaseOrders()

  const vendorById = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v])), [vendors.data])
  const poById = useMemo(() => new Map((pos.data ?? []).map((p) => [p.id, p])), [pos.data])

  const columns: Column<SupplierInvoice>[] = [
    { key: "no", header: "Invoice no.", render: (r) => <span className="font-medium">{r.invoice_number}</span> },
    { key: "vendor", header: "Vendor", render: (r) => vendorById.get(r.vendor_id)?.name ?? "—" },
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum text-muted-foreground">{r.invoice_date}</span>,
    },
    {
      key: "qty",
      header: "Invoiced (kg)",
      numeric: true,
      render: (r) => formatKg(r.lines.reduce((s, l) => s + parseFloat(l.invoiced_qty_kg), 0)),
    },
    { key: "po", header: "PO", render: (r) => (r.po_id ? poById.get(r.po_id)?.po_number ?? "—" : "—") },
    {
      key: "eway",
      header: "E-way / Vehicle",
      render: (r) => (
        <span className="text-muted-foreground">
          {[r.eway_bill_number, r.vehicle_number].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Supplier Invoices"
        description="Tier-1 anchor: GST-tracked quantity, hard to fabricate."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/invoices/new">
              <Plus /> Add invoice
            </Link>
          </Button>
        }
      />
      {invoices.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(invoices.error, "Could not load supplier invoices.")}
        </Banner>
      )}
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={invoices.data ?? []}
          rowKey={(r) => r.id}
          loading={invoices.isLoading}
          empty={
            <EmptyState
              icon={<Receipt />}
              title="No invoices recorded"
              description="Add a supplier invoice so incoming GRNs can be reconciled against it."
              action={
                <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                  <Link to="/invoices/new">
                    <Plus /> Add invoice
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
    </Page>
  )
}
