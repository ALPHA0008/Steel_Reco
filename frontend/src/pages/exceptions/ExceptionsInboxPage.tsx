import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  ShieldCheck,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { Page, PageHeader } from "@/components/app/page"
import { Banner } from "@/components/app/banner"
import { ExceptionResolveDialog } from "@/components/app/exception-resolve-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime } from "@/lib/format"
import { useExceptions, useResolveException } from "@/lib/queries"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import type { ExceptionLog, ExceptionResolutionType } from "@/lib/types"

const RESOLUTION_LABEL: Record<ExceptionResolutionType, string> = {
  approved: "Approved as-is",
  corrected: "Corrected",
  follow_up: "Marked for follow-up",
}

/** Where the flagged row lives, named the way a QS says it rather than by
 *  table name — "store_issue" and "grn" are our schema, not their vocabulary. */
const SOURCE_LABEL: Record<string, string> = {
  grn: "GRN",
  store_issue: "Store Issue",
  inter_site_transfer: "Transfer",
  physical_count: "Physical Count",
  scrap_sale: "Scrap Sale",
  jmr_actual: "JMR",
  bbs_plan: "BBS",
  purchase_order: "Purchase Order",
  supplier_invoice: "Supplier Invoice",
  myhome_stock: "MyHome Stock",
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
/** Card as a motion component, so each exception can carry layout/enter/exit
 *  animation while keeping the shared Card styling. */
const MotionCard = motion.create(Card)

export function ExceptionsInboxPage() {
  const reduceMotion = useReducedMotion()
  const [tab, setTab] = useState<"open" | "resolved">("open")
  const [sev, setSev] = useState<SevFilter>("all")
  const exceptions = useExceptions(tab)
  const resolve = useResolveException()
  const [target, setTarget] = useState<ExceptionLog | null>(null)
  const [resolutionType, setResolutionType] = useState<ExceptionResolutionType>("approved")
  // A refused attempt (re-check still fails, bad follow-up date) keeps the
  // dialog open and shows why, instead of closing and losing the typed reason.
  const [rejection, setRejection] = useState<string | null>(null)

  function openResolve(exc: ExceptionLog, type: ExceptionResolutionType) {
    setTarget(exc)
    setResolutionType(type)
    setRejection(null)
  }

  const all = exceptions.data ?? []
  const blockingCount = useMemo(() => all.filter((e) => e.severity === "blocking").length, [all])
  const advisoryCount = all.length - blockingCount

  // Blocking first, then newest first within a severity — the worst thing to
  // deal with is always at the top of the list.
  const sorted = useMemo(() => {
    const filtered = sev === "all" ? all : all.filter((e) => e.severity === sev)
    // Triage order: a lapsed commitment outranks everything (someone already
    // promised to handle it), then blocking, then a parked follow-up sinks below
    // anything still awaiting a first decision, then newest first.
    const rank = (e: ExceptionLog) =>
      e.status === "open" && e.reopened_count > 0 ? 0 : e.status === "pending" ? 2 : 1
    return [...filtered].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [all, sev])

  // Paginate so a long inbox (100+ advisories) is scannable, worst-first.
  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const rows = useMemo(
    () => sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [sorted, clampedPage],
  )
  // Any change to the filter set or tab returns to page 1.
  useEffect(() => {
    setPage(1)
  }, [sev, tab])

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
        <motion.div layout className="space-y-3">
          {/* AnimatePresence + layout so changing the severity filter or page
              re-flows smoothly instead of swapping rows instantly. `popLayout`
              takes exiting cards out of the layout immediately, so the
              remaining ones close the gap in one motion rather than waiting. */}
          <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((exc, i) => {
            const blocking = exc.severity === "blocking"
            // A parked follow-up reads as neither clean nor alarming: it's a
            // commitment with a clock on it, so it gets its own quieter tone.
            const parked = exc.status === "pending"
            // Came back because a promised date lapsed -- the strongest signal
            // on the card, since someone already said they'd handle it.
            const lapsed = exc.status === "open" && exc.reopened_count > 0
            return (
              <MotionCard
                key={exc.id}
                layout
                initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                transition={{
                  duration: 0.32,
                  delay: reduceMotion ? 0 : Math.min(i, 8) * 0.035,
                  ease: [0.23, 1, 0.32, 1],
                  layout: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
                }}
                className={cn(
                  "relative overflow-hidden p-4 shadow-(--shadow-card)",
                  // Severity stripe down the left edge — the fastest scan cue.
                  "before:absolute before:inset-y-0 before:left-0 before:w-1",
                  parked
                    ? "before:bg-muted-foreground/40"
                    : blocking
                      ? "before:bg-danger"
                      : "before:bg-warning",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                        parked
                          ? "bg-muted text-muted-foreground"
                          : blocking
                            ? "bg-danger-subtle text-danger"
                            : "bg-warning-subtle text-warning",
                      )}
                    >
                      {parked ? (
                        <CalendarClock className="size-4" />
                      ) : blocking ? (
                        <OctagonAlert className="size-4" />
                      ) : (
                        <TriangleAlert className="size-4" />
                      )}
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
                            {SOURCE_LABEL[exc.transaction_table] ?? exc.transaction_table.replaceAll("_", " ")}
                          </span>
                        )}
                        {parked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                            <CalendarClock className="size-3" />
                            Due {formatDate(exc.follow_up_due_date)}
                          </span>
                        )}
                        {lapsed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                            <RotateCcw className="size-3" />
                            Overdue{exc.reopened_count > 1 ? ` ×${exc.reopened_count}` : ""}
                          </span>
                        )}
                      </div>
                      {/* whitespace-pre-line: an overdue re-open appends its
                          warning as a second line of the message. */}
                      <p className="mt-1 whitespace-pre-line text-[13px] text-muted-foreground">{exc.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(exc.created_at)}
                        {parked && exc.resolver_reason && <> · “{exc.resolver_reason}”</>}
                        {exc.status === "resolved" && exc.resolution_type && (
                          <> · {RESOLUTION_LABEL[exc.resolution_type]} — “{exc.resolver_reason}”</>
                        )}
                        {exc.status === "resolved" && exc.validation_state === "verified" && (
                          <span className="ml-1 inline-flex items-center gap-1 font-medium text-success">
                            <ShieldCheck className="size-3" />
                            re-checked
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {(exc.status === "open" || parked) && (
                    // Full-width action row on mobile (buttons no longer collide
                    // with the title); inline on desktop. "Corrected" is the
                    // primary path — it fixes the underlying record — so it's
                    // solid; the other two are quieter outline actions.
                    //
                    // Parked rows keep their actions: a follow-up has to land on
                    // corrected or approved eventually, and offering "Follow up"
                    // again lets a date be revised without waiting for it to lapse.
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
                        {parked ? "Reschedule" : "Follow up"}
                      </Button>
                    </div>
                  )}
                </div>
              </MotionCard>
            )
          })}
          </AnimatePresence>

          {/* Pagination — only when the list runs past one page. */}
          {sorted.length > PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-3 pt-1 sm:flex-row">
              <div className="text-[12.5px] text-muted-foreground">
                Showing{" "}
                <span className="tnum font-medium text-foreground">
                  {(clampedPage - 1) * PAGE_SIZE + 1}–{Math.min(clampedPage * PAGE_SIZE, sorted.length)}
                </span>{" "}
                of <span className="tnum font-medium text-foreground">{sorted.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage(clampedPage - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="tnum px-2 text-[12.5px] text-muted-foreground">
                  Page {clampedPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage(clampedPage + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      <ExceptionResolveDialog
        exception={target}
        resolutionType={resolutionType}
        pending={resolve.isPending}
        rejection={rejection}
        onDismissRejection={() => setRejection(null)}
        onOpenChange={(open) => !open && setTarget(null)}
        onConfirm={(reason, followUpDueDate) => {
          if (!target) return
          setRejection(null)
          resolve.mutate(
            {
              id: target.id,
              resolution_type: resolutionType,
              reason,
              follow_up_due_date: followUpDueDate,
            },
            {
              onSuccess: (row) => {
                setTarget(null)
                if (row.status === "pending") {
                  toast.success(
                    `Follow-up set for ${formatDate(row.follow_up_due_date)}. It stays open until then.`,
                  )
                } else if (row.validation_state === "verified") {
                  toast.success("Re-checked against current data — it passes. Resolved.")
                } else {
                  toast.success("Approved as-is and recorded.")
                }
              },
              onError: (err) => {
                const code = apiErrorCode(err)
                // These are decisions the flow is meant to refuse, not faults:
                // keep the dialog open so the reason typed isn't thrown away.
                const recoverable =
                  code === "correction_not_verified" ||
                  code === "follow_up_date_required" ||
                  code === "follow_up_date_invalid"
                if (recoverable) {
                  setRejection(apiErrorMessage(err, "That could not be accepted."))
                  return
                }
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
