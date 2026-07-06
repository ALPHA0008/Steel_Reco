import type { ReactNode } from "react"
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"

type BannerVariant = "info" | "advisory" | "blocking"

const STYLES: Record<BannerVariant, { box: string; Icon: typeof Info }> = {
  info: { box: "border-info-border bg-info-subtle text-info", Icon: Info },
  advisory: { box: "border-warning-border bg-warning-subtle text-warning", Icon: TriangleAlert },
  blocking: { box: "border-danger-border bg-danger-subtle text-danger", Icon: CircleAlert },
}

/**
 * Two-tier error model (design.md §9.5):
 *  - advisory: saved but flagged (e.g. GRN with no PO) — dismissible
 *  - blocking: a rule rejected the write (422) — names the exact constraint
 * Status is never color-alone: every banner carries an icon + text.
 */
export function Banner({
  variant,
  children,
  onDismiss,
  className,
}: {
  variant: BannerVariant
  children: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const { box, Icon } = STYLES[variant]
  return (
    <div
      role={variant === "blocking" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
