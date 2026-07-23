import { Search, X, ChevronDown, Check, ChevronLeft, ChevronRight, ListFilter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { TableControls } from "@/components/app/table-controls"

/**
 * Toolbar for a ledger table: search anchors the left, faceted multi-select
 * filters cluster next to it, active selections appear as removable chips, and
 * a Reset clears everything. Follows the faceted-filter pattern (trigger button
 * with a count badge, popover with checkable options + clear).
 */
export function DataTableToolbar<T>({
  controls,
  searchPlaceholder = "Search…",
  className,
}: {
  controls: TableControls<T>
  searchPlaceholder?: string
  className?: string
}) {
  const { facets, facetOptions, selected, toggleFacet, clearFacet, activeChips, hasActiveFilters, resetAll } = controls

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={controls.search}
            onChange={(e) => controls.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search rows"
            className="h-9 pl-9 pr-8"
          />
          {controls.search && (
            <button
              type="button"
              onClick={() => controls.setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Faceted filters */}
        {facets.map((f) => {
          const chosen = selected[f.key]
          const count = chosen?.size ?? 0
          const options = facetOptions[f.key] ?? []
          if (options.length === 0) return null
          return (
            <DropdownMenu key={f.key}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-9 border-dashed", count > 0 && "border-solid border-brand-border bg-brand-subtle text-brand-text")}
                >
                  <ListFilter className="size-3.5" />
                  {f.label}
                  {count > 0 && (
                    <span className="tnum ml-0.5 rounded bg-brand px-1.5 text-[10.5px] font-semibold text-brand-foreground">
                      {count}
                    </span>
                  )}
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[320px] w-56 overflow-y-auto p-1">
                {options.map((opt) => {
                  const active = chosen?.has(opt) ?? false
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleFacet(f.key, opt)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border",
                          active ? "border-brand bg-brand text-brand-foreground" : "border-input",
                        )}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{opt}</span>
                    </button>
                  )
                })}
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => clearFacet(f.key)}
                    className="mt-1 w-full rounded-md border-t px-2 py-1.5 text-center text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Clear {f.label.toLowerCase()}
                  </button>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={resetAll}>
            <X className="size-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Active-filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={`${chip.facetKey}:${chip.value}`}
              type="button"
              onClick={() => toggleFacet(chip.facetKey, chip.value)}
              className="group inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1.5 text-[12px] font-medium transition-colors hover:border-brand-border"
            >
              <span className="text-muted-foreground">{chip.facetLabel}:</span>
              {chip.value}
              <span className="grid size-4 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-danger-subtle group-hover:text-danger">
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Footer: "Showing 1–25 of 979" · rows-per-page · truncated page controls. */
export function DataTablePagination<T>({
  controls,
  pageSizeOptions = [25, 50, 100],
  className,
}: {
  controls: TableControls<T>
  pageSizeOptions?: number[]
  className?: string
}) {
  const { rangeStart, rangeEnd, filteredTotal, total, page, pageCount, setPage, pageSize, setPageSize } = controls
  const filtered = filteredTotal !== total

  return (
    <div className={cn("flex flex-col-reverse gap-3 border-t bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="text-[12.5px] text-muted-foreground">
        Showing <span className="tnum font-medium text-foreground">{rangeStart.toLocaleString("en-IN")}</span>
        {"–"}
        <span className="tnum font-medium text-foreground">{rangeEnd.toLocaleString("en-IN")}</span> of{" "}
        <span className="tnum font-medium text-foreground">{filteredTotal.toLocaleString("en-IN")}</span>
        {filtered && <span className="ml-1">(filtered from {total.toLocaleString("en-IN")})</span>}
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-[12.5px] text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger size="sm" className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageNumbers(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap${i}`} className="px-1 text-[12.5px] text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon-sm"
                className={cn("tnum", p === page && "bg-brand text-brand-foreground hover:bg-brand-hover")}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => setPage(p as number)}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Page range with truncation around the current page: 1 … 4 5 [6] 7 8 … 40 */
function pageNumbers(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out: (number | "…")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(count - 1, current + 1)
  if (start > 2) out.push("…")
  for (let p = start; p <= end; p++) out.push(p)
  if (end < count - 1) out.push("…")
  out.push(count)
  return out
}
