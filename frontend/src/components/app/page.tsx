import type { ReactNode } from "react"

/** Standard page container: generous chrome, dense content (design.md §6). */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1440px] p-7">{children}</div>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  )
}
