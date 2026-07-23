import { useMemo, useState, type CSSProperties } from "react"
import { CircleCheck, TriangleAlert, OctagonAlert } from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"
import { useExceptions, useResolveException } from "@/lib/queries"
import { apiErrorMessage } from "@/lib/api"
import type { ExceptionLog, ExceptionResolutionType } from "@/lib/types"

const RESOLUTION_LABEL: Record<ExceptionResolutionType, string> = {
  approved: "Approved as-is",
  corrected: "Corrected",
  follow_up: "Marked for follow-up",
}

/** Severity filter: All / just the blocking ones / just advisories. */
type SevFilter = "all" | "blocking" | "advisory"

/**
 * Every advisory a rule has raised, in one place (plan §6). The trust-tier
 * model means these are expected, not embarrassing — this is where a QS
 * closes the loop the tool opened (PROCESS_AND_VALIDATION.md §3).
 *
 * Triage first: blocking exceptions sort to the top and carry a red stripe so
 * a physically-impossible violation never reads the same as a 20% advisory.
 */
export function ExceptionsInboxPage() {
  const [tab, setTab] = useState<"open" | "resolved">("open")
  const [sev, setSev] = useState<SevFilter>("all")
  const exceptions = useExceptions(tab)
  const resolve = useResolveException()
  const [target, setTarget] = useState<ExceptionLog | null>(null)
  const [resolutionType, setResolutionType] = useState<ExceptionResolutionType>("approved")

  function openResolve(exc: ExceptionLog, type: ExceptionResolutionType) {
    setTarget(exc)
    setResolutionType(type)
  }

  const all = exceptions.data ?? []
  const blockingCount = useMemo(() => all.filter((e) => e.severity === "blocking").length, [all])
  const advisoryCount = all.length - blockingCount

  // Blocking first, then newest first within a severity — the worst thing to
  // deal with is always at the top of the list.
  const rows = useMemo(() => {
    const filtered = sev === "all" ? all : all.filter((e) => e.severity === sev)
    return [...filtered].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [all, sev])

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

      {/* Severity triage bar — counts double as filters so the worst class is
          one tap away. Only meaningful when there's something to triage. */}
      {!exceptions.isLoading && all.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SevChip
            label="All"
            count={all.length}
            active={sev === "all"}
            tone="neutral"
            onClick={() => setSev("all")}
          />
          <SevChip
            label="Blocking"
            count={blockingCount}
            active={sev === "blocking"}
            tone="danger"
            onClick={() => setSev(blockingCount ? "blocking" : "all")}
          />
          <SevChip
            label="Advisory"
            count={advisoryCount}
            active={sev === "advisory"}
            tone="warning"
            onClick={() => setSev(advisoryCount ? "advisory" : "all")}
          />
        </div>
      )}

      {exceptions.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
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
          {rows.map((exc, i) => {
            const blocking = exc.severity === "blocking"
            return (
              <Card
                key={exc.id}
                style={{ "--stagger-index": Math.min(i, 8) } as CSSProperties}
                className={cn(
                  "stagger-in relative overflow-hidden p-4 shadow-(--shadow-card)",
                  // Severity stripe down the left edge — the fastest scan cue.
                  "before:absolute before:inset-y-0 before:left-0 before:w-1",
                  blocking ? "before:bg-danger" : "before:bg-warning",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                        blocking ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
                      )}
                    >
                      {blocking ? <OctagonAlert className="size-4" /> : <TriangleAlert className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{exc.rule_name.replaceAll("_", " ")}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                            blocking ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
                          )}
                        >
                          {blocking ? "Blocking" : "Advisory"}
                        </span>
                        {exc.transaction_table && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {exc.transaction_table}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">{exc.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(exc.created_at)}
                        {exc.status === "resolved" && exc.resolution_type && (
                          <> · {RESOLUTION_LABEL[exc.resolution_type]} — “{exc.resolver_reason}”</>
                        )}
                      </p>
                    </div>
                  </div>
                  {exc.status === "open" && (
                    // Full-width action row on mobile (buttons no longer collide
                    // with the title); inline on desktop. "Corrected" is the
                    // primary path — it fixes the underlying record — so it's
                    // solid; the other two are quieter outline actions.
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                      <Button
                        size="sm"
                        className="bg-brand text-brand-foreground hover:bg-brand-hover"
                        onClick={() => openResolve(exc, "corrected")}
                      >
                        Corrected
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openResolve(exc, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openResolve(exc, "follow_up")}>
                        Follow up
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
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

/** A count pill that also acts as a severity filter. */
function SevChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  tone: "neutral" | "danger" | "warning"
  onClick: () => void
}) {
  const dot =
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-muted-foreground/50"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-foreground/20 bg-accent text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {tone !== "neutral" && <span className={cn("size-2 rounded-full", dot)} />}
      {label}
      <span className="tnum rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">{count}</span>
    </button>
  )
}
