import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowLeftRight, Plus, TriangleAlert } from "lucide-react"
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
import {
  useContractors,
  useDiaGrades,
  useStoreIssues,
  diaLabel,
  formatKg,
} from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { StoreIssue } from "@/lib/types"

export function StoreIssueListPage() {
  const issues = useStoreIssues()
  const contractors = useContractors()
  const dias = useDiaGrades()

  const contractorById = useMemo(
    () => new Map((contractors.data ?? []).map((c) => [c.id, c])),
    [contractors.data],
  )
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])

  const allIssues = useMemo(() => issues.data ?? [], [issues.data])
  const contractorName = (r: StoreIssue) => contractorById.get(r.contractor_id)?.name ?? ""
  const diaName = (r: StoreIssue) => diaLabel(diaById.get(r.dia_grade_id))
  const directionWord = (r: StoreIssue) => (r.direction === "out" ? "Issued out" : "Returned to store")

  const controls = useTableControls(allIssues, {
    searchText: (r) => `${contractorName(r)} ${diaName(r)} ${directionWord(r)}`,
    facets: [
      { key: "contractor", label: "Contractor", accessor: contractorName },
      { key: "dia", label: "Dia", accessor: diaName },
      { key: "direction", label: "Direction", accessor: directionWord },
    ],
    sorts: {
      date: (r) => r.effective_date,
      contractor: (r) => contractorName(r),
      qty: (r) => parseFloat(r.quantity_kg) || 0,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allIssues
    const totalKg = rows.reduce((a, r) => a + (parseFloat(r.quantity_kg) || 0), 0)
    const distinctContractors = new Set(rows.map((r) => r.contractor_id)).size
    const flagged = rows.filter((r) => r.warning).length
    return { count: rows.length, totalKg, distinctContractors, flagged }
  }, [allIssues])

  const columns: Column<StoreIssue>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      sortKey: true,
      render: (r) => contractorById.get(r.contractor_id)?.name ?? "—",
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "qty", header: "Qty (kg)", numeric: true, sortKey: true, render: (r) => formatKg(r.quantity_kg) },
    {
      key: "direction",
      header: "Direction",
      render: (r) =>
        r.direction === "out" ? (
          <Badge variant="secondary" className="font-medium">Issued out</Badge>
        ) : (
          <Badge className="bg-info-subtle font-medium text-info">Returned to store</Badge>
        ),
    },
    {
      key: "flag",
      header: "Flag",
      render: (r) =>
        r.warning ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning" title={r.warning}>
            <TriangleAlert className="size-3.5" /> Advisory
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Store Issues"
        description="Steel issued to contractors from the store pool — issued is a genuine sum, never copied from receipts."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/store-issues/new">
              <Plus /> Record issue
            </Link>
          </Button>
        }
      />
      {issues.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(issues.error, "Could not load store issues.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!issues.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "Issues", value: summary.count.toLocaleString("en-IN") },
              { label: "Total issued", value: `${formatKg(summary.totalKg)} kg` },
              { label: "Contractors", value: summary.distinctContractors.toLocaleString("en-IN") },
              {
                label: "Flagged",
                value: summary.flagged.toLocaleString("en-IN"),
                tone: summary.flagged > 0 ? "warning" : "muted",
                hint: summary.flagged > 0 ? "advisory" : "all clean",
              },
            ]}
          />
        )}
        {!issues.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search contractor, dia…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={issues.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<ArrowLeftRight />}
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
                  icon={<ArrowLeftRight />}
                  title="No issues recorded yet"
                  description="Record the first issue to a contractor to begin."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/store-issues/new">
                        <Plus /> Record issue
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!issues.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
