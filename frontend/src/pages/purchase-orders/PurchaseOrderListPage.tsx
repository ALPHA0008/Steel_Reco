import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { FileText, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { DataTableToolbar, DataTablePagination } from "@/components/app/data-table-toolbar"
import { SummaryStrip } from "@/components/app/summary-strip"
import { useTableControls } from "@/components/app/table-controls"
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

  const allPos = useMemo(() => pos.data ?? [], [pos.data])
  const vendorName = (r: PurchaseOrder) => vendorById.get(r.vendor_id)?.name ?? ""
  const orderedKg = (r: PurchaseOrder) =>
    r.lines.reduce((s, l) => s + (parseFloat(l.ordered_qty_kg) || 0), 0)

  const controls = useTableControls(allPos, {
    searchText: (r) => `${r.po_number} ${vendorName(r)} ${r.status}`,
    facets: [
      { key: "vendor", label: "Vendor", accessor: vendorName },
      { key: "status", label: "Status", accessor: (r) => r.status },
    ],
    sorts: {
      po: (r) => r.po_number,
      date: (r) => r.order_date,
      ordered: (r) => orderedKg(r),
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allPos
    const totalOrdered = rows.reduce((a, r) => a + orderedKg(r), 0)
    const distinctVendors = new Set(rows.map((r) => r.vendor_id)).size
    const closed = rows.filter((r) => r.status === "closed").length
    return { count: rows.length, totalOrdered, distinctVendors, closed }
  }, [allPos])

  const columns: Column<PurchaseOrder>[] = [
    { key: "po", header: "PO number", sortKey: true, render: (r) => <span className="font-medium">{r.po_number}</span> },
    { key: "vendor", header: "Vendor", render: (r) => vendorById.get(r.vendor_id)?.name ?? "—" },
    {
      key: "date",
      header: "Order date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.order_date)}</span>,
    },
    {
      key: "qty",
      header: "Ordered (kg)",
      numeric: true,
      sortKey: "ordered",
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
      <div className="space-y-4">
        {!pos.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "POs", value: summary.count.toLocaleString("en-IN") },
              { label: "Total ordered", value: `${formatKg(summary.totalOrdered)} kg` },
              { label: "Vendors", value: summary.distinctVendors.toLocaleString("en-IN") },
              {
                label: "Closed",
                value: summary.closed.toLocaleString("en-IN"),
                tone: "muted",
              },
            ]}
          />
        )}
        {!pos.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search PO number, vendor, status…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={pos.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<FileText />}
                  title="No rows match your filters"
                  description="Try clearing a filter or search term."
                  action={
                    <Button variant="outline" onClick={controls.resetAll}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
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
              )
            }
          />
          {!pos.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
