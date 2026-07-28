import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ClipboardCheck, Pencil, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { DataTableToolbar, DataTablePagination } from "@/components/app/data-table-toolbar"
import { SummaryStrip } from "@/components/app/summary-strip"
import { useTableControls } from "@/components/app/table-controls"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useContractors, useDiaGrades, useJmrActuals, useTowers, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { JmrActual } from "@/lib/types"

export function JmrListPage() {
  const navigate = useNavigate()
  const jmrs = useJmrActuals()
  const towers = useTowers()
  const dias = useDiaGrades()
  const contractors = useContractors()

  // Rows another row has corrected: still listed (audit trail) but struck
  // through — they no longer count toward the Abstract or the rule checks.
  const supersededIds = useMemo(
    () => new Set((jmrs.data ?? []).map((r) => r.corrected_from_id).filter(Boolean)),
    [jmrs.data],
  )

  const towerById = useMemo(() => new Map((towers.data ?? []).map((t) => [t.id, t])), [towers.data])
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])
  const contractorById = useMemo(
    () => new Map((contractors.data ?? []).map((c) => [c.id, c])),
    [contractors.data],
  )

  const allJmrs = useMemo(() => jmrs.data ?? [], [jmrs.data])
  const towerName = (r: JmrActual) => towerById.get(r.tower_id)?.name ?? ""
  const diaName = (r: JmrActual) => diaLabel(diaById.get(r.dia_grade_id))
  const contractorName = (r: JmrActual) =>
    r.contractor_id ? contractorById.get(r.contractor_id)?.name ?? "" : ""

  const controls = useTableControls(allJmrs, {
    searchText: (r) => `${towerName(r)} ${r.pour_number ?? ""} ${diaName(r)} ${contractorName(r)}`,
    facets: [
      { key: "tower", label: "Tower", accessor: towerName },
      { key: "dia", label: "Dia", accessor: diaName },
      { key: "contractor", label: "Contractor", accessor: contractorName },
    ],
    sorts: {
      date: (r) => r.effective_date,
      tower: (r) => towerName(r),
      measured: (r) => parseFloat(r.measured_weight_kg) || 0,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allJmrs
    const totalMeasured = rows
      .filter((r) => !supersededIds.has(r.id))
      .reduce((a, r) => a + (parseFloat(r.measured_weight_kg) || 0), 0)
    const distinctTowers = new Set(rows.map((r) => r.tower_id)).size
    return { count: rows.length, totalMeasured, distinctTowers, superseded: supersededIds.size }
  }, [allJmrs, supersededIds])

  const columns: Column<JmrActual>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    { key: "tower", header: "Tower", sortKey: true, render: (r) => towerById.get(r.tower_id)?.name ?? "—" },
    { key: "pour", header: "Pour no.", render: (r) => r.pour_number ?? "—" },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    {
      key: "measured",
      header: "Measured (kg)",
      numeric: true,
      sortKey: true,
      render: (r) => (
        <span className={supersededIds.has(r.id) ? "text-muted-foreground line-through" : undefined}>
          {formatKg(r.measured_weight_kg)}
        </span>
      ),
    },
    {
      key: "contractor",
      header: "Contractor",
      render: (r) => (r.contractor_id ? contractorById.get(r.contractor_id)?.name ?? "—" : "—"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        supersededIds.has(r.id) ? (
          <span className="text-xs text-muted-foreground">Superseded</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/jmr/new", { state: { correctFrom: r } })}
          >
            <Pencil /> Correct
          </Button>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="JMR Actual"
        description="Jointly measured work — the measured counterpart the BBS plan is compared against."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/jmr/new">
              <Plus /> Add JMR row
            </Link>
          </Button>
        }
      />
      {jmrs.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(jmrs.error, "Could not load JMR rows.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!jmrs.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "JMR rows", value: summary.count.toLocaleString("en-IN") },
              { label: "Total measured", value: `${formatKg(summary.totalMeasured)} kg` },
              { label: "Towers", value: summary.distinctTowers.toLocaleString("en-IN") },
              {
                label: "Superseded",
                value: summary.superseded.toLocaleString("en-IN"),
                tone: "muted",
              },
            ]}
          />
        )}
        {!jmrs.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search tower, pour, contractor…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={jmrs.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<ClipboardCheck />}
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
                  icon={<ClipboardCheck />}
                  title="No JMR rows yet"
                  description="Jointly measured quantities appear here."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/jmr/new">
                        <Plus /> Add JMR row
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!jmrs.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
