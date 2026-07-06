import { useState } from "react"
import { CircleCheck, Lock, PackageOpen, Plus, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { Field } from "@/components/app/field"
import { KpiCard } from "@/components/app/kpi"
import { EmptyState } from "@/components/app/empty-state"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DataTable, type Column } from "@/components/app/data-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

/** Living reference of every primitive in its real states (M2 deliverable). */

interface DemoRow {
  id: string
  grn: string
  supplier: string
  dia: string
  net: string
  status: "ok" | "warn"
}

const DEMO_ROWS: DemoRow[] = [
  { id: "1", grn: "GRN-0431", supplier: "JSW Steel", dia: "16 mm", net: "16,440", status: "warn" },
  { id: "2", grn: "GRN-0430", supplier: "Vizag Steel", dia: "20 mm", net: "24,860", status: "ok" },
  { id: "3", grn: "GRN-0429", supplier: "Tata Steel", dia: "12 mm", net: "18,220", status: "ok" },
]

const COLUMNS: Column<DemoRow>[] = [
  { key: "grn", header: "GRN", render: (r) => <span className="text-muted-foreground">{r.grn}</span> },
  { key: "supplier", header: "Supplier", render: (r) => r.supplier },
  { key: "dia", header: "Dia", render: (r) => r.dia },
  { key: "net", header: "Net (kg)", numeric: true, render: (r) => r.net },
  {
    key: "status",
    header: "Status",
    render: (r) =>
      r.status === "ok" ? (
        <Badge className="bg-success-subtle text-success">Reconciled</Badge>
      ) : (
        <Badge className="bg-warning-subtle text-warning">No PO</Badge>
      ),
  },
]

export function StyleguidePage() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [fieldValue, setFieldValue] = useState("")

  return (
    <Page>
      <PageHeader
        title="Styleguide"
        description="Every primitive in its real states — the reference each screen composes from."
        actions={
          <Button className="bg-brand text-brand-foreground hover:bg-brand-hover">
            <Plus /> Primary CTA
          </Button>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">KPI tiles</h2>
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Net Received" value="308.98" unit="MT" icon={<PackageOpen />} chip="Cumulative" />
          <KpiCard label="Consumption + WIP" value="293.50" unit="MT" chip="On plan" chipTone="success" />
          <KpiCard label="Physical Stock" value="12.49" unit="MT" chip="Reconciled" chipTone="success" />
          <KpiCard label="Wastage" value="4.97%" tone="danger" icon={<TriangleAlert />} chip="▲ over 3% cap" chipTone="danger" />
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Banners — two-tier error model</h2>
        <Banner variant="advisory" onDismiss={() => toast("Dismissed")}>
          Saved. This GRN has no linked Purchase Order — flagged for reconciliation.
        </Banner>
        <Banner variant="blocking">
          Cannot issue 4,200 kg of 16 mm — only 3,850 kg is in store. Reduce the quantity or record a
          receipt first.
        </Banner>
        <Banner variant="info">April 2026 is finalized. Reopen it to make corrections.</Banner>
      </section>

      <section className="mb-8 grid grid-cols-2 gap-6">
        <Card className="shadow-(--shadow-card)">
          <CardHeader>
            <CardTitle className="text-sm">Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Field
              label="Supplier Invoice No."
              required
              error={fieldValue ? undefined : "Enter the supplier invoice number."}
              render={(p) => (
                <Input
                  {...p}
                  placeholder="e.g. INV-2026-0412"
                  value={fieldValue}
                  onChange={(e) => setFieldValue(e.target.value)}
                />
              )}
            />
            <Field
              label="Net weight (kg)"
              description="Auto-calculated from gross − tare. Not editable."
              render={(p) => <Input {...p} readOnly value="16,440" className="tnum bg-muted" />}
            />
          </CardContent>
        </Card>

        <Card className="shadow-(--shadow-card)">
          <CardHeader>
            <CardTitle className="text-sm">Buttons & dialogs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button className="bg-brand text-brand-foreground hover:bg-brand-hover">
              <Lock /> Finalize Month
            </Button>
            <Button variant="outline">Export</Button>
            <Button variant="ghost">Filter</Button>
            <Button variant="destructive" onClick={() => setReopenOpen(true)}>
              Reopen…
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              Confirm demo
            </Button>
            <Button onClick={() => toast.success("GRN saved.")}>
              <CircleCheck /> Toast
            </Button>
            <Button disabled>Disabled</Button>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Data table</h2>
        <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
          <DataTable
            columns={COLUMNS}
            rows={DEMO_ROWS}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No rows" />}
          />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Empty state</h2>
        <Card className="py-0 shadow-(--shadow-card)">
          <EmptyState
            icon={<PackageOpen />}
            title="No GRNs recorded for April 2026 yet"
            description="Record the first receipt to begin this month's ledger."
            action={
              <Button className="bg-brand text-brand-foreground hover:bg-brand-hover">
                <Plus /> Record GRN
              </Button>
            }
          />
        </Card>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Finalize April 2026?"
        description="The Abstract will be snapshotted and the month locked against edits."
        confirmLabel="Finalize"
        onConfirm={() => {
          setConfirmOpen(false)
          toast.success("April 2026 finalized.")
        }}
      />
      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Reopen April 2026?"
        description="The finalized figures will unlock and a new snapshot will be created on re-finalize."
        confirmLabel="Reopen"
        destructive
        requireReason
        onConfirm={() => {
          setReopenOpen(false)
          toast("April 2026 reopened.")
        }}
      />
    </Page>
  )
}
