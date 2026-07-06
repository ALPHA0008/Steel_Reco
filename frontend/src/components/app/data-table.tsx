import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export interface Column<T> {
  key: string
  header: ReactNode
  align?: "left" | "right"
  /** right-aligned numeric column with tabular figures */
  numeric?: boolean
  className?: string
  render: (row: T) => ReactNode
}

/**
 * Dense list table (design.md §9.3): 36px rows, striped, hoverable,
 * loading skeletons that reserve final dimensions, explicit empty state.
 * (The Abstract's pinned-column grid is its own component — M5.)
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  skeletonRows = 6,
  empty,
  onRowClick,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  skeletonRows?: number
  empty: ReactNode
  onRowClick?: (row: T) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "h-9 border-b bg-muted/60 px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground",
                  (c.align === "right" || c.numeric) && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className="h-9 border-b px-4">
                    <Skeleton className="h-3.5 w-full max-w-28" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "transition-colors odd:bg-row-stripe hover:bg-row-hover",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-9 border-b px-4",
                      (c.align === "right" || c.numeric) && "text-right",
                      c.numeric && "tnum",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
