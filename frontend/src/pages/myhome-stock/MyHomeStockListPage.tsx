import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Warehouse } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { DataTableToolbar, DataTablePagination } from "@/components/app/data-table-toolbar"
import { SummaryStrip } from "@/components/app/summary-strip"
import { useTableControls } from "@/components/app/table-controls"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDiaGrades, useMyHomeStock, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { MyHomeStock } from "@/lib/types"

/**
 * Steel sitting at My Home's own yard/store -- a physical location distinct
 * from any contractor's site. Each entry is a snapshot count (like Physical
 * Count); only the LATEST row per diameter counts toward the Abstract's
 * Total Physical (K = I + J + this), never a sum of every entry.
 */
export function MyHomeStockListPage() {
  const stock = useMyHomeStock()
  const dias = useDiaGrades()
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])

  const allStock = useMemo(() => stock.data ?? [], [stock.data])
  const diaName = (r: MyHomeStock) => diaLabel(diaById.get(r.dia_grade_id))

  const controls = useTableControls(allStock, {
    searchText: (r) => `${diaName(r)} ${r.notes ?? ""}`,
    facets: [{ key: "dia", label: "Dia", accessor: diaName }],
    sorts: {
      date: (r) => r.effective_date,
      dia: (r) => diaName(r),
      qty: (r) => parseFloat(r.qty_kg) || 0,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allStock
    // Latest snapshot per dia -- same "latest, not summed" rule the Abstract
    // uses, so the summary answers "what does K's MyHome bucket read right
    // now", not a meaningless running total of every count ever taken.
    const latestByDia = new Map<string, MyHomeStock>()
    for (const r of rows) {
      const existing = latestByDia.get(r.dia_grade_id)
      if (!existing || r.effective_date > existing.effective_date) latestByDia.set(r.dia_grade_id, r)
    }
    const currentTotalKg = [...latestByDia.values()].reduce((a, r) => a + (parseFloat(r.qty_kg) || 0), 0)
    const distinctDias = latestByDia.size
    return { count: rows.length, currentTotalKg, distinctDias }
  }, [allStock])

  const columns: Column<MyHomeStock>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    { key: "dia", header: "Dia", sortKey: true, render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "qty", header: "Qty (kg)", numeric: true, sortKey: true, render: (r) => formatKg(r.qty_kg) },
    {
      key: "notes",
      header: "Notes",
      render: (r) => <span className="text-muted-foreground">{r.notes || "—"}</span>,
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Stock at My Home"
        description="Steel currently sitting at My Home's own yard -- feeds the Abstract's Total Physical (K) alongside contractor-held stock."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/myhome-stock/new">
              <Plus /> Record stock
            </Link>
          </Button>
        }
      />
      {stock.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(stock.error, "Could not load My Home stock.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!stock.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              { label: "Entries", value: summary.count.toLocaleString("en-IN") },
              {
                label: "Current stock",
                value: `${formatKg(summary.currentTotalKg)} kg`,
                hint: "latest snapshot per dia",
              },
              { label: "Diameters tracked", value: summary.distinctDias.toLocaleString("en-IN") },
            ]}
          />
        )}
        {!stock.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search dia, notes…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={stock.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<Warehouse />}
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
                  icon={<Warehouse />}
                  title="No My Home stock recorded"
                  description="Record what's currently sitting at the yard, per diameter."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/myhome-stock/new">
                        <Plus /> Record stock
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!stock.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
