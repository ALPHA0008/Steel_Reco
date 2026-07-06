import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ClipboardCheck, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useContractors, useDiaGrades, useJmrActuals, useTowers, diaLabel, formatKg } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { JmrActual } from "@/lib/types"

export function JmrListPage() {
  const jmrs = useJmrActuals()
  const towers = useTowers()
  const dias = useDiaGrades()
  const contractors = useContractors()

  const towerById = useMemo(() => new Map((towers.data ?? []).map((t) => [t.id, t])), [towers.data])
  const diaById = useMemo(() => new Map((dias.data ?? []).map((d) => [d.id, d])), [dias.data])
  const contractorById = useMemo(
    () => new Map((contractors.data ?? []).map((c) => [c.id, c])),
    [contractors.data],
  )

  const columns: Column<JmrActual>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum text-muted-foreground">{r.effective_date}</span>,
    },
    { key: "tower", header: "Tower", render: (r) => towerById.get(r.tower_id)?.name ?? "—" },
    { key: "pour", header: "Pour no.", render: (r) => r.pour_number ?? "—" },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    {
      key: "measured",
      header: "Measured (kg)",
      numeric: true,
      render: (r) => formatKg(r.measured_weight_kg),
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
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={jmrs.data ?? []}
          rowKey={(r) => r.id}
          loading={jmrs.isLoading}
          empty={
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
          }
        />
      </Card>
    </Page>
  )
}
