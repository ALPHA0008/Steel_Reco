import { useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/**
 * Field wrapper: label above control, 24px vertical rhythm, inline error
 * announced via role="alert" (design.md §9.5, WCAG 3.3.x).
 * Pass `render` to receive the generated id + aria attributes for the control.
 */
export function Field({
  label,
  required,
  description,
  error,
  className,
  render,
}: {
  label: string
  required?: boolean
  description?: string
  error?: string
  className?: string
  render: (props: {
    id: string
    "aria-invalid": boolean | undefined
    "aria-describedby": string | undefined
    "aria-required": boolean | undefined
  }) => ReactNode
}) {
  const id = useId()
  const descId = description ? `${id}-desc` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden className="text-danger">
            *
          </span>
        )}
      </Label>
      {render({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [descId, errId].filter(Boolean).join(" ") || undefined,
        "aria-required": required || undefined,
      })}
      {description && !error && (
        <p id={descId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
