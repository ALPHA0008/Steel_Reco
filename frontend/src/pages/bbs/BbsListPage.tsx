import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Ruler } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { DataTableToolbar, DataTablePagination } from "@/components/app/data-table-toolbar"
import { SummaryStrip } from "@/components/app/summary-strip"
import { useTableControls } from "@/components/app/table-controls"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useBbsPlans, useContractors, useDiaGrades, useTowers, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { BbsPlan } from "@/lib/types"

export function BbsListPage() {
  const plans = useBbsPlans()
  const towers = useTowers()
  const dias = useDiaGrades()
  const contractors = useContractors()

  const towerById = useMemo(() => new Map((towers.data ?? []).map((t) => [t.id, t])), [towers.data])
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])
  const contractorById = useMemo(
    () => new Map((contractors.data ?? []).map((c) => [c.id, c])),
    [contractors.data],
  )

  const allPlans = useMemo(() => plans.data ?? [], [plans.data])
  const towerName = (r: BbsPlan) => towerById.get(r.tower_id)?.name ?? ""
  const diaName = (r: BbsPlan) => diaLabel(diaById.get(r.dia_grade_id))
  const contractorName = (r: BbsPlan) =>
    r.contractor_id ? contractorById.get(r.contractor_id)?.name ?? "" : ""

  const controls = useTableControls(allPlans, {
    searchText: (r) =>
      `${towerName(r)} ${r.bar_mark ?? ""} ${r.pour_description ?? ""} ${diaName(r)} ${contractorName(r)}`,
    facets: [
      { key: "tower", label: "Tower", accessor: towerName },
      { key: "dia", label: "Dia", accessor: diaName },
      { key: "contractor", label: "Contractor", accessor: contractorName },
    ],
    sorts: {
      tower: (r) => towerName(r),
      planned: (r) => parseFloat(r.planned_weight_kg) || 0,
    },
    defaultSort: { key: "planned", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allPlans
    const totalPlanned = rows.reduce((a, r) => a + (parseFloat(r.planned_weight_kg) || 0), 0)
    const distinctTowers = new Set(rows.map((r) => r.tower_id)).size
    return { count: rows.length, totalPlanned, distinctTowers }
  }, [allPlans])

  const columns: Column<BbsPlan>[] = [
    { key: "tower", header: "Tower", sortKey: true, render: (r) => towerById.get(r.tower_id)?.name ?? "—" },
    { key: "mark", header: "Bar mark", render: (r) => r.bar_mark ?? "—" },
    {
      key: "pour",
      header: "Pour",
      render: (r) => <span className="text-muted-foreground">{r.pour_description ?? "—"}</span>,
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    {
      key: "planned",
      header: "Planned (kg)",
      numeric: true,
      sortKey: true,
      render: (r) => formatKg(r.planned_weight_kg),
    },
    {
      key: "contractor",
      header: "Contractor",
      render: (r) => (r.contractor_id ? contractorById.get(r.contractor_id)?.name ?? "—" : "—"),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="BBS Plan"
        description="Planned bar-mark quantities — the Tier-1 theoretical baseline every consumption claim is checked against."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/bbs/new">
              <Plus /> Add BBS row
            </Link>
          </Button>
        }
      />
      {plans.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(plans.error, "Could not load BBS plans.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!plans.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "BBS rows", value: summary.count.toLocaleString("en-IN") },
              { label: "Total planned", value: `${formatKg(summary.totalPlanned)} kg` },
              { label: "Towers", value: summary.distinctTowers.toLocaleString("en-IN") },
            ]}
          />
        )}
        {!plans.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search tower, bar mark, pour…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={plans.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<Ruler />}
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
                  icon={<Ruler />}
                  title="No BBS rows yet"
                  description="Planned quantities from the bar bending schedule appear here."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/bbs/new">
                        <Plus /> Add BBS row
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!plans.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
