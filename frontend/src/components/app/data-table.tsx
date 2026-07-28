import type { ReactNode } from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
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
  /** when set, this header is clickable and sorts by this key (must exist in
   *  the useTableControls `sorts` map). Falls back to `key` if `true`. */
  sortKey?: string | boolean
}

/** Sort state passed down from useTableControls so headers can render + toggle. */
export interface DataTableSort {
  sort: { key: string; dir: "asc" | "desc" } | null
  toggleSort: (key: string) => void
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
  sorting,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  skeletonRows?: number
  empty: ReactNode
  onRowClick?: (row: T) => void
  sorting?: DataTableSort
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortKey =
                c.sortKey === true ? c.key : typeof c.sortKey === "string" ? c.sortKey : null
              const sortable = sorting != null && sortKey != null
              const activeDir = sortable && sorting!.sort?.key === sortKey ? sorting!.sort!.dir : null
              const rightAlign = c.align === "right" || c.numeric
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={activeDir ? (activeDir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "h-9 border-b bg-muted/60 px-4 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground",
                    rightAlign && "text-right",
                    c.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => sorting!.toggleSort(sortKey!)}
                      className={cn(
                        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        rightAlign && "flex-row-reverse",
                        activeDir && "text-foreground",
                      )}
                    >
                      {c.header}
                      {activeDir === "asc" ? (
                        <ChevronUp className="size-3.5" />
                      ) : activeDir === "desc" ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
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
                  "transition-colors duration-150 odd:bg-row-stripe hover:bg-row-hover",
                  // A clickable row should acknowledge the press, not just the
                  // hover -- otherwise a tap on mobile gives no feedback at all.
                  onRowClick && "cursor-pointer active:bg-row-selected",
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
