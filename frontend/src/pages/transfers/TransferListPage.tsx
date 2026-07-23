import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Truck } from "lucide-react"
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
import { useDiaGrades, useTransfers, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { InterSiteTransfer } from "@/lib/types"

export function TransferListPage() {
  const transfers = useTransfers()
  const dias = useDiaGrades()
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])

  const allTransfers = useMemo(() => transfers.data ?? [], [transfers.data])
  const diaName = (r: InterSiteTransfer) => diaLabel(diaById.get(r.dia_grade_id))
  const typeLabel = (r: InterSiteTransfer) => (r.flag === "loan" ? "Loan out" : "Return")

  const controls = useTableControls(allTransfers, {
    searchText: (r) => `${typeLabel(r)} ${diaName(r)} ${r.ho_approval_ref ?? ""} ${r.record_source}`,
    facets: [
      { key: "type", label: "Type", accessor: typeLabel },
      { key: "dia", label: "Dia", accessor: diaName },
    ],
    sorts: {
      date: (r) => r.effective_date,
      qty: (r) => parseFloat(r.quantity_kg) || 0,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allTransfers
    const totalKg = rows.reduce((a, r) => a + (parseFloat(r.quantity_kg) || 0), 0)
    const loans = rows.filter((r) => r.flag === "loan").length
    return { count: rows.length, totalKg, loans, returns: rows.length - loans }
  }, [allTransfers])

  const columns: Column<InterSiteTransfer>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    {
      key: "flag",
      header: "Type",
      render: (r) =>
        r.flag === "loan" ? (
          <Badge variant="secondary" className="font-medium">Loan out</Badge>
        ) : (
          <Badge className="bg-info-subtle font-medium text-info">Return</Badge>
        ),
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "qty", header: "Qty (kg)", numeric: true, sortKey: true, render: (r) => formatKg(r.quantity_kg) },
    {
      key: "to",
      header: "To project",
      render: (r) => <span className="tnum text-xs text-muted-foreground">{r.to_project_id.slice(0, 8)}…</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (r) => <span className="uppercase text-xs text-muted-foreground">{r.record_source}</span>,
    },
    {
      key: "ho",
      header: "HO approval",
      render: (r) =>
        r.ho_approval_ref ? (
          <span className="text-muted-foreground">{r.ho_approval_ref}</span>
        ) : (
          <Badge className="bg-warning-subtle font-medium text-warning">None</Badge>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Inter-site Transfers"
        description="Steel loaned to or returned from other My Home sites."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/transfers/new">
              <Plus /> Record transfer
            </Link>
          </Button>
        }
      />
      {transfers.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(transfers.error, "Could not load transfers.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!transfers.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "Transfers", value: summary.count.toLocaleString("en-IN") },
              { label: "Total moved", value: `${formatKg(summary.totalKg)} kg` },
              { label: "Loans out", value: summary.loans.toLocaleString("en-IN") },
              { label: "Returns", value: summary.returns.toLocaleString("en-IN"), tone: "muted" },
            ]}
          />
        )}
        {!transfers.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search type, dia, approval…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={transfers.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<Truck />}
                  title="No transfers match your filters"
                  description="Try clearing a filter or search term."
                  action={
                    <Button variant="outline" onClick={controls.resetAll}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Truck />}
                  title="No transfers recorded"
                  description="Loans to other sites and their returns appear here."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/transfers/new">
                        <Plus /> Record transfer
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!transfers.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
