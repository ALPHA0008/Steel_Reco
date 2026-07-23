import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { FileText, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { usePurchaseOrders, useVendors, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { PurchaseOrder } from "@/lib/types"

const STATUS_TONE: Record<PurchaseOrder["status"], string> = {
  open: "bg-info-subtle text-info",
  partial: "bg-warning-subtle text-warning",
  closed: "bg-success-subtle text-success",
  cancelled: "bg-muted text-muted-foreground",
}

export function PurchaseOrderListPage() {
  const pos = usePurchaseOrders()
  const vendors = useVendors()
  const vendorById = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v])), [vendors.data])

  const columns: Column<PurchaseOrder>[] = [
    { key: "po", header: "PO number", render: (r) => <span className="font-medium">{r.po_number}</span> },
    { key: "vendor", header: "Vendor", render: (r) => vendorById.get(r.vendor_id)?.name ?? "—" },
    {
      key: "date",
      header: "Order date",
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.order_date)}</span>,
    },
    {
      key: "qty",
      header: "Ordered (kg)",
      numeric: true,
      render: (r) => formatKg(r.lines.reduce((s, l) => s + parseFloat(l.ordered_qty_kg), 0)),
    },
    { key: "lines", header: "Lines", numeric: true, render: (r) => String(r.lines.length) },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge className={STATUS_TONE[r.status]}>{r.status}</Badge>,
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Purchase Orders"
        description="Tier-1 anchor: the contractual quantity every GRN is reconciled against."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/purchase-orders/new">
              <Plus /> Add PO
            </Link>
          </Button>
        }
      />
      {pos.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(pos.error, "Could not load purchase orders.")}
        </Banner>
      )}
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={pos.data ?? []}
          rowKey={(r) => r.id}
          loading={pos.isLoading}
          empty={
            <EmptyState
              icon={<FileText />}
              title="No purchase orders recorded"
              description="Add a PO so incoming GRNs can be reconciled against it."
              action={
                <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                  <Link to="/purchase-orders/new">
                    <Plus /> Add PO
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
