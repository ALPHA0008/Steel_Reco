import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowLeftRight, Plus, TriangleAlert } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
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

  const columns: Column<StoreIssue>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      render: (r) => contractorById.get(r.contractor_id)?.name ?? "—",
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "qty", header: "Qty (kg)", numeric: true, render: (r) => formatKg(r.quantity_kg) },
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
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={issues.data ?? []}
          rowKey={(r) => r.id}
          loading={issues.isLoading}
          empty={
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
          }
        />
      </Card>
    </Page>
  )
}
