import { Link } from "react-router-dom"
import { Plus, Recycle } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
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

  const columns: Column<ScrapSale>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum text-muted-foreground">{r.effective_date}</span>,
    },
    { key: "buyer", header: "Buyer", render: (r) => r.buyer_name },
    { key: "kg", header: "Weight (kg)", numeric: true, render: (r) => formatKg(r.weight_kg) },
    { key: "rate", header: "Rate (₹/kg)", numeric: true, render: (r) => formatKg(r.rate_per_kg) },
    { key: "total", header: "Total", numeric: true, render: (r) => formatInr(r.total_amount) },
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
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={sales.data ?? []}
          rowKey={(r) => r.id}
          loading={sales.isLoading}
          empty={
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
          }
        />
      </Card>
    </Page>
  )
}
