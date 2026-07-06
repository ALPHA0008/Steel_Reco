import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Grid3x3, Plus } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
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

  const columns: Column<PhysicalCount>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum text-muted-foreground">{r.effective_date}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      render: (r) => contractorById.get(r.contractor_id)?.name ?? "—",
    },
    { key: "dia", header: "Dia", render: (r) => diaLabel(diaById.get(r.dia_grade_id)) },
    { key: "bundles", header: "Bundles", numeric: true, render: (r) => String(r.bundle_count) },
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
      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={counts.data ?? []}
          rowKey={(r) => r.id}
          loading={counts.isLoading}
          empty={
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
          }
        />
      </Card>
    </Page>
  )
}
