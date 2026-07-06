import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "./field"
import { Input } from "@/components/ui/input"

/**
 * Confirm dialog that names the exact object/period (design.md §9.8).
 * `requireReason` powers destructive flows like Reopen — submit stays
 * disabled until a non-empty reason is entered (PRD story 20).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  requireReason,
  reasonLabel = "Reason",
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  requireReason?: boolean
  reasonLabel?: string
  pending?: boolean
  onConfirm: (reason?: string) => void
}) {
  const [reason, setReason] = useState("")
  const disabled = pending || (requireReason && reason.trim().length === 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("")
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireReason && (
          <Field
            label={reasonLabel}
            required
            render={(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being done?"
              />
            )}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className={!destructive ? "bg-brand text-brand-foreground hover:bg-brand-hover" : undefined}
            disabled={disabled}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
