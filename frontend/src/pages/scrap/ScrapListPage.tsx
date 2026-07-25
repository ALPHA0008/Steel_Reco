import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Recycle } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { DataTableToolbar, DataTablePagination } from "@/components/app/data-table-toolbar"
import { SummaryStrip } from "@/components/app/summary-strip"
import { useTableControls } from "@/components/app/table-controls"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useScrapSales, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { ScrapSale } from "@/lib/types"

function formatInr(v: string): string {
  return parseFloat(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function ScrapListPage() {
  const sales = useScrapSales()

  const allSales = useMemo(() => sales.data ?? [], [sales.data])

  const controls = useTableControls(allSales, {
    searchText: (r) => `${r.buyer_name} ${r.gate_pass_no ?? ""} ${r.invoice_ref ?? ""}`,
    facets: [{ key: "buyer", label: "Buyer", accessor: (r) => r.buyer_name }],
    sorts: {
      date: (r) => r.effective_date,
      buyer: (r) => r.buyer_name,
      kg: (r) => parseFloat(r.weight_kg) || 0,
      total: (r) => parseFloat(r.total_amount) || 0,
    },
    defaultSort: { key: "date", dir: "desc" },
  })

  const summary = useMemo(() => {
    const rows = allSales
    const totalKg = rows.reduce((a, r) => a + (parseFloat(r.weight_kg) || 0), 0)
    const totalValue = rows.reduce((a, r) => a + (parseFloat(r.total_amount) || 0), 0)
    const distinctBuyers = new Set(rows.map((r) => r.buyer_name)).size
    return { count: rows.length, totalKg, totalValue, distinctBuyers }
  }, [allSales])

  const columns: Column<ScrapSale>[] = [
    {
      key: "date",
      header: "Date",
      sortKey: true,
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    { key: "buyer", header: "Buyer", sortKey: true, render: (r) => r.buyer_name },
    { key: "kg", header: "Weight (kg)", numeric: true, sortKey: true, render: (r) => formatKg(r.weight_kg) },
    { key: "rate", header: "Rate (₹/kg)", numeric: true, render: (r) => formatKg(r.rate_per_kg) },
    { key: "total", header: "Total", numeric: true, sortKey: true, render: (r) => formatInr(r.total_amount) },
    {
      key: "refs",
      header: "GP / Invoice",
      render: (r) => (
        <span className="text-muted-foreground">
          {[r.gate_pass_no, r.invoice_ref].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Scrap Sales"
        description="Scrap sold out of the yard — section N of the Abstract."
        actions={
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Link to="/scrap/new">
              <Plus /> Record sale
            </Link>
          </Button>
        }
      />
      {sales.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(sales.error, "Could not load scrap sales.")}
        </Banner>
      )}
      <div className="space-y-4">
        {!sales.isLoading && summary.count > 0 && (
          <SummaryStrip
            stats={[
              {
                label: "Sales",
                value: summary.count.toLocaleString("en-IN"),
                numericValue: summary.count,
                format: (n) => Math.round(n).toLocaleString("en-IN"),
              },
              {
                label: "Total weight",
                value: `${formatKg(summary.totalKg)} kg`,
                numericValue: summary.totalKg,
                format: (n) => `${formatKg(n)} kg`,
              },
              {
                label: "Total value",
                value: formatInr(String(summary.totalValue)),
                numericValue: summary.totalValue,
                format: (n) =>
                  n.toLocaleString("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }),
                tone: "success",
              },
              {
                label: "Buyers",
                value: summary.distinctBuyers.toLocaleString("en-IN"),
                numericValue: summary.distinctBuyers,
                format: (n) => Math.round(n).toLocaleString("en-IN"),
              },
            ]}
          />
        )}
        {!sales.isLoading && summary.count > 0 && (
          <DataTableToolbar controls={controls} searchPlaceholder="Search buyer, gate pass, invoice…" />
        )}
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={columns}
            rows={controls.rows}
            rowKey={(r) => r.id}
            loading={sales.isLoading}
            sorting={controls}
            empty={
              controls.hasActiveFilters ? (
                <EmptyState
                  icon={<Recycle />}
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
                  icon={<Recycle />}
                  title="No scrap sales recorded"
                  description="Sales appear here with their computed totals."
                  action={
                    <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
                      <Link to="/scrap/new">
                        <Plus /> Record sale
                      </Link>
                    </Button>
                  }
                />
              )
            }
          />
          {!sales.isLoading && summary.count > 0 && <DataTablePagination controls={controls} />}
        </Card>
      </div>
    </Page>
  )
}
