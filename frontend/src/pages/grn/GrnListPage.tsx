import { useMemo } from "react"
import { Link } from "react-router-dom"
import { PackageOpen, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDiaGrades, useGrns, usePurchaseOrders, useVendors, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { Grn, ReceiptType } from "@/lib/types"

const RECEIPT_LABELS: Record<ReceiptType, string> = {
  against_po: "Against PO",
  other_site_sap: "Other site (SAP)",
  other_site_excel: "Other site (Excel)",
}

export function GrnListPage() {
  const grns = useGrns()
  const vendors = useVendors()
  const dias = useDiaGrades()
  const purchaseOrders = usePurchaseOrders()

  const vendorById = useMemo(
    () => new Map((vendors.data ?? []).map((v) => [v.id, v])),
    [vendors.data],
  )
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])
  const poById = useMemo(() => new Map((purchaseOrders.data ?? []).map((p) => [p.id, p])), [purchaseOrders.data])

  const columns: Column<Grn>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum text-muted-foreground">{r.effective_date}</span>,
    },
    { key: "vendor", header: "Vendor", render: (r) => vendorById.get(r.vendor_id)?.name ?? "—" },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "net", header: "Net (kg)", numeric: true, render: (r) => formatKg(r.weighbridge_weight_kg) },
    {
      key: "type",
      header: "Receipt",
      render: (r) => (
        <Badge variant="secondary" className="font-medium">
          {RECEIPT_LABELS[r.receipt_type]}
          {r.source_site ? ` · ${r.source_site}` : ""}
        </Badge>
      ),
    },
    {
      key: "po",
      header: "PO",
      render: (r) => {
        if (r.po_id) return <span className="text-muted-foreground">{poById.get(r.po_id)?.po_number ?? "—"}</span>
        if (r.po_reference) return <span className="text-muted-foreground">{r.po_reference} (unlinked)</span>
        return <Badge className="bg-warning-subtle font-medium text-warning">No PO</Badge>
      },
    },
    {
      key: "recon",
      header: "Reconciliation",
      render: (r) =>
        r.warning ? (
          <span className="text-xs font-medium text-warning" title={r.warning}>
            ⚠ Flagged
          </span>
        ) : r.po_id || r.supplier_invoice_id ? (
          <span className="text-xs font-medium text-success">✓ Anchored</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="GRN"
        description="Goods receipts into the store — the inbound side of the ledger."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/grn/new">
              <Plus /> Record GRN
            </Link>
          </Button>
        }
      />

      {grns.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(grns.error, "Could not load GRNs.")}
        </Banner>
      )}

      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={grns.data ?? []}
          rowKey={(r) => r.id}
          loading={grns.isLoading}
          empty={
            <EmptyState
              icon={<PackageOpen />}
              title="No GRNs recorded yet"
              description="Record the first receipt to begin the ledger."
              action={
                <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                  <Link to="/grn/new">
                    <Plus /> Record GRN
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
