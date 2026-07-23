import type { ReactNode } from "react"

/** Standard page container: generous chrome, dense content (design.md §6).
 * Padding relaxes on small screens so the content isn't crushed by 28px
 * gutters on a phone. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-7">{children}</div>
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-muted-foreground">{description}</p>}
      </div>
      {/* Actions wrap on their own row on mobile; each child can grow so tab
          groups + CTAs don't spill off the right edge. */}
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  )
}
