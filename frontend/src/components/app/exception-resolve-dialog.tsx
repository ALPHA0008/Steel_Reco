import { useEffect, useId, useState } from "react"
import { ShieldCheck, CalendarClock, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "./field"
import { Banner } from "./banner"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ExceptionLog, ExceptionResolutionType } from "@/lib/types"

/** Local-time YYYY-MM-DD. `toISOString()` would shift to UTC and, for IST,
 *  hand yesterday's date to a backend that rejects dates in the past. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Last day of next month — mirrors the backend's `_end_of_next_month`, so the
 *  date picker can't offer something the API will refuse. */
function closeHorizon(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth() + 2, 0)
}

const COPY: Record<
  ExceptionResolutionType,
  { title: string; blurb: string; cta: string; icon: typeof ShieldCheck }
> = {
  corrected: {
    title: "Mark as corrected",
    blurb:
      "The tool re-runs this exact check against the data as it stands now. If it still fails, this is refused — so fix the underlying record first.",
    cta: "Re-check and resolve",
    icon: ShieldCheck,
  },
  approved: {
    title: "Approve as-is",
    blurb:
      "This overrides a check that is still failing. It resolves the exception and is recorded against your name with the reason you give.",
    cta: "Approve with reason",
    icon: CircleAlert,
  },
  follow_up: {
    title: "Commit to a follow-up",
    blurb:
      "This does not resolve anything. It parks the exception until the date you set, still blocking the month close, and returns it to you if the date passes.",
    cta: "Set follow-up",
    icon: CalendarClock,
  },
}

/**
 * Resolving an exception, with the validation the flow now demands.
 *
 * Purpose-built rather than a ConfirmDialog: follow-up needs a bounded date
 * field, and a refused correction has to keep the dialog open with the typed
 * reason intact — the QS needs to read why it was refused and change their
 * answer, not retype everything from a closed dialog.
 */
export function ExceptionResolveDialog({
  exception,
  resolutionType,
  pending,
  rejection,
  role,
  onDismissRejection,
  onOpenChange,
  onConfirm,
}: {
  exception: ExceptionLog | null
  resolutionType: ExceptionResolutionType
  pending?: boolean
  /** Message from a refused attempt (e.g. the re-check still fails). */
  rejection?: string | null
  /** The signed-in account's role, shown read-only. Displayed rather than
   *  entered because it is a fact about the session, not a claim — and it is
   *  never sent to the server, which reads it from the token itself. */
  role?: string
  onDismissRejection: () => void
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string, resolverName: string, followUpDueDate?: string) => void
}) {
  const [reason, setReason] = useState("")
  const [due, setDue] = useState("")
  const [name, setName] = useState("")
  const nameFieldId = useId()
  const nameHelpId = `${nameFieldId}-help`

  const today = new Date()
  const minDate = isoDate(today)
  const maxDate = isoDate(closeHorizon(today))

  // Reset per exception/path so a previous attempt's text never leaks into a
  // different decision -- but NOT on `rejection`, which must preserve input.
  useEffect(() => {
    setReason("")
    setDue("")
    setName("")
  }, [exception?.id, resolutionType])

  const copy = COPY[resolutionType]
  const Icon = copy.icon
  const needsDate = resolutionType === "follow_up"
  const disabled =
    pending ||
    reason.trim().length === 0 ||
    name.trim().length < 2 ||
    (needsDate && due.length === 0)

  return (
    <Dialog
      open={exception !== null}
      onOpenChange={(o) => {
        if (!o) onDismissRejection()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {/* Left-aligned even on mobile: the shadcn default centres the header,
            which makes this dialog's multi-line explanation harder to read and
            inconsistent with the left-aligned fields under it. */}
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-lg",
                resolutionType === "corrected"
                  ? "bg-brand/10 text-brand"
                  : resolutionType === "approved"
                    ? "bg-warning-subtle text-warning"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.blurb}</DialogDescription>
        </DialogHeader>

        {/* What the rule actually said, so the decision is made against the
            finding rather than from memory. */}
        {exception?.message && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            {exception.message}
          </p>
        )}

        {rejection && (
          <Banner variant="blocking">
            <span className="font-semibold">Not accepted.</span> {rejection}
          </Banner>
        )}

        {needsDate && (
          <Field
            label="Resolve by"
            required
            description={`Must be on or before ${formatDate(maxDate)} — a commitment can't outrun the month close it is holding up.`}
            render={(props) => (
              <Input
                {...props}
                type="date"
                value={due}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDue(e.target.value)}
              />
            )}
          />
        )}

        <Field
          label={resolutionType === "approved" ? "Why is this acceptable?" : "Reason"}
          required
          description={
            resolutionType === "approved"
              ? "The check is still failing, so this is a judgement call on the record."
              : undefined
          }
          render={(props) => (
            <Textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                resolutionType === "corrected"
                  ? "What was changed, and where?"
                  : resolutionType === "approved"
                    ? "e.g. opening stock predates the system"
                    : "What needs to happen, and who is doing it?"
              }
            />
          )}
        />

        {/* The signature sits last, immediately above the action: you sign
            after reading the finding and writing the reason, not before. */}
        <div className="border-t border-border pt-4">
          {/* Name and role sit on one row, aligned on the controls themselves —
              the helper text below spans both so the two inputs stay level. */}
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor={nameFieldId}>
                Decided by
                <span aria-hidden className="text-danger">
                  *
                </span>
              </Label>
              <Input
                id={nameFieldId}
                aria-required
                aria-describedby={nameHelpId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="off"
              />
            </div>
            {/* Read-only: taken from the signed-in session, not typed, and not
                sent to the server (which reads the role from the token). */}
            <div className="space-y-2">
              <Label asChild>
                <span>Role</span>
              </Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-[13px] font-medium text-muted-foreground">
                {role ?? "—"}
              </div>
            </div>
          </div>
          <p id={nameHelpId} className="mt-2 text-xs text-muted-foreground">
            Site logins are shared, so name the person making this call.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand-hover"
            disabled={disabled}
            onClick={() => onConfirm(reason.trim(), name.trim(), needsDate ? due : undefined)}
          >
            {pending ? "Checking…" : copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
