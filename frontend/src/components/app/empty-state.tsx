import type { ReactNode } from "react"
import { Inbox } from "lucide-react"

/** Explicit empty state — a zero-row list is never a blank table (design.md §9.9). */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <span className="mb-3 grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
