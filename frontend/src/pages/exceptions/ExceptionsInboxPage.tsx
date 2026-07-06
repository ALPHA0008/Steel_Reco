import { useState } from "react"
import { CircleCheck, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useExceptions, useResolveException } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { ExceptionLog, ExceptionResolutionType } from "@/lib/types"

const RESOLUTION_LABEL: Record<ExceptionResolutionType, string> = {
  approved: "Approved as-is",
  corrected: "Corrected",
  follow_up: "Marked for follow-up",
}

/**
 * Every advisory a rule has raised, in one place (plan §6). The trust-tier
 * model means these are expected, not embarrassing — this is where a QS
 * closes the loop the tool opened (PROCESS_AND_VALIDATION.md §3).
 */
export function ExceptionsInboxPage() {
  const [tab, setTab] = useState<"open" | "resolved">("open")
  const exceptions = useExceptions(tab)
  const resolve = useResolveException()
  const [target, setTarget] = useState<ExceptionLog | null>(null)
  const [resolutionType, setResolutionType] = useState<ExceptionResolutionType>("approved")

  function openResolve(exc: ExceptionLog, type: ExceptionResolutionType) {
    setTarget(exc)
    setResolutionType(type)
  }

  return (
    <Page>
      <PageHeader
        title="Exceptions"
        description="Every rule that flagged something — advisory today, blocking once thresholds are proven (plan §5.3)."
        actions={
          <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "resolved")}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {exceptions.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(exceptions.error, "Could not load exceptions.")}
        </Banner>
      )}

      {exceptions.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (exceptions.data ?? []).length === 0 ? (
        <Card className="py-0 shadow-(--shadow-card)">
          <EmptyState
            icon={<CircleCheck />}
            title={tab === "open" ? "No open exceptions" : "Nothing resolved yet"}
            description={
              tab === "open"
                ? "Every rule that has run so far passed clean."
                : "Resolved exceptions will appear here."
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {(exceptions.data ?? []).map((exc) => (
            <Card key={exc.id} className="p-4 shadow-(--shadow-card)">
              <div className="flex items-start gap-3">
                <span
                  className={
                    exc.severity === "blocking"
                      ? "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-danger-subtle text-danger"
                      : "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-warning-subtle text-warning"
                  }
                >
                  <TriangleAlert className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{exc.rule_name.replaceAll("_", " ")}</span>
                    {exc.transaction_table && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {exc.transaction_table}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">{exc.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(exc.created_at).toLocaleString()}
                    {exc.status === "resolved" && exc.resolution_type && (
                      <> · {RESOLUTION_LABEL[exc.resolution_type]} — “{exc.resolver_reason}”</>
                    )}
                  </p>
                </div>
                {exc.status === "open" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openResolve(exc, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openResolve(exc, "corrected")}>
                      Corrected
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openResolve(exc, "follow_up")}>
                      Follow up
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`${RESOLUTION_LABEL[resolutionType]}?`}
        description={target?.message ?? undefined}
        confirmLabel="Resolve"
        requireReason
        reasonLabel="Reason"
        pending={resolve.isPending}
        onConfirm={(reason) => {
          if (!target) return
          resolve.mutate(
            { id: target.id, resolution_type: resolutionType, reason: reason! },
            {
              onSuccess: () => {
                setTarget(null)
                toast.success("Exception resolved.")
              },
              onError: (err) => {
                setTarget(null)
                toast.error(apiErrorMessage(err, "Could not resolve the exception."))
              },
            },
          )
        }}
      />
    </Page>
  )
}
