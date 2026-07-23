import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Plus, Truck } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
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

  const columns: Column<InterSiteTransfer>[] = [
    {
      key: "date",
      header: "Date",
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
    { key: "qty", header: "Qty (kg)", numeric: true, render: (r) => formatKg(r.quantity_kg) },
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
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={transfers.data ?? []}
          rowKey={(r) => r.id}
          loading={transfers.isLoading}
          empty={
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
          }
        />
      </Card>
    </Page>
  )
}
