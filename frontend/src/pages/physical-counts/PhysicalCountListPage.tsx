import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Grid3x3, Plus } from "lucide-react"
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
import { useContractors, useDiaGrades, usePhysicalCounts, diaLabel } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { PhysicalCount } from "@/lib/types"

export function PhysicalCountListPage() {
  const counts = usePhysicalCounts()
  const contractors = useContractors()
  const dias = useDiaGrades()

  const contractorById = useMemo(
    () => new Map((contractors.data ?? []).map((c) => [c.id, c])),
    [contractors.data],
  )
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])

  const allCounts = useMemo(() => counts.data ?? [], [counts.data])
  const contractorName = (r: PhysicalCount) => contractorById.get(r.contractor_id)?.name ?? ""
  const diaName = (r: PhysicalCount) => diaLabel(diaById.get(r.dia_grade_id))

  const controls = useTableControls(allCounts, {
    searchText: (r) => `${contractorName(r)} ${diaName(r)}`,
    facets: [
      { key: "contractor", label: "Contractor", accessor: contractorName },
      { key: "dia", label: "Dia", accessor: diaName },
    ],
    sorts: {
      date: (r) => r.effective_date,
      bundles: (r) => r.bundle_count,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allCounts
    const distinctContractors = new Set(rows.map((r) => r.contractor_id)).size
    const withCutPieces = rows.filter((r) => r.cut_pieces.length > 0).length
    return { count: rows.length, distinctContractors, withCutPieces }
  }, [allCounts])

  const columns: Column<PhysicalCount>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      render: (r) => contractorById.get(r.contractor_id)?.name ?? "—",
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "bundles", header: "Bundles", numeric: true, sortKey: true, render: (r) => String(r.bundle_count) },
    { key: "loose", header: "Loose rods", numeric: true, render: (r) => String(r.loose_rod_count) },
    {
      key: "cut",
      header: "Cut pieces",
      render: (r) =>
        r.cut_pieces.length > 0 ? (
          <Badge variant="secondary" className="tnum font-medium">
            {r.cut_pieces.length} · all classified
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Physical Count"
        description="Month-end counted stock — full-length, loose, and every cut piece classified."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/physical-counts/new">
              <Plus /> Record count
            </Link>
          </Button>
        }
      />
      {counts.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(counts.error, "Could not load physical counts.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!counts.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "Counts", value: summary.count.toLocaleString("en-IN") },
              { label: "Contractors", value: summary.distinctContractors.toLocaleString("en-IN") },
              {
                label: "With cut pieces",
                value: summary.withCutPieces.toLocaleString("en-IN"),
                tone: "muted",
              },
            ]}
          />
        )}
        {!counts.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search contractor, dia…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={counts.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<Grid3x3 />}
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
                  icon={<Grid3x3 />}
                  title="No counts recorded"
                  description="Month-end physical verification appears here."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/physical-counts/new">
                        <Plus /> Record count
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!counts.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
