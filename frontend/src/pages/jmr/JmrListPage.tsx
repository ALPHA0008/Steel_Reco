import { formatDate } from "@/lib/format"
import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ClipboardCheck, Pencil, Plus } from "lucide-react"
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

  const columns: Column<JmrActual>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum whitespace-nowrap text-muted-foreground">{formatDate(r.effective_date)}</span>,
    },
    { key: "tower", header: "Tower", render: (r) => towerById.get(r.tower_id)?.name ?? "—" },
    { key: "pour", header: "Pour no.", render: (r) => r.pour_number ?? "—" },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    {
      key: "measured",
      header: "Measured (kg)",
      numeric: true,
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
