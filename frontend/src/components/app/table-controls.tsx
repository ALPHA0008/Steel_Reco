import { useMemo, useState } from "react"

/**
 * Shared client-side table controls for the ledger list pages. One hook drives
 * search, faceted multi-select filters, single-column sort, and pagination for
 * every dense table so all seven pages behave identically. All work is
 * client-side (the pages already fetch the full set), so this is pure derive
 * over the incoming rows — no new network calls.
 */

export interface Facet<T> {
  /** stable key, used as the filter's identity */
  key: string
  /** label shown on the trigger button + chips */
  label: string
  /** the value a row contributes to this facet (the option the user picks) */
  accessor: (row: T) => string | null | undefined
}

export interface SortSpec<T> {
  key: string
  /** comparator returning the row's sortable value for this key */
  value: (row: T) => string | number
}

export interface TableControlsConfig<T> {
  /** free-text search: the concatenated haystack for a row */
  searchText?: (row: T) => string
  facets?: Facet<T>[]
  /** columns that can be sorted, keyed by column key */
  sorts?: Record<string, (row: T) => string | number>
  defaultSort?: { key: string; dir: "asc" | "desc" }
  pageSize?: number
}

export type SortDir = "asc" | "desc"

export interface TableControls<T> {
  // derived output
  rows: T[]
  total: number
  filteredTotal: number
  // search
  search: string
  setSearch: (v: string) => void
  // facets
  facets: Facet<T>[]
  facetOptions: Record<string, string[]>
  selected: Record<string, Set<string>>
  toggleFacet: (facetKey: string, value: string) => void
  clearFacet: (facetKey: string) => void
  // active-filter summary
  activeChips: { facetKey: string; facetLabel: string; value: string }[]
  hasActiveFilters: boolean
  resetAll: () => void
  // sort
  sort: { key: string; dir: SortDir } | null
  toggleSort: (key: string) => void
  sortableKeys: Set<string>
  // pagination
  page: number
  setPage: (p: number) => void
  pageSize: number
  setPageSize: (n: number) => void
  pageCount: number
  rangeStart: number
  rangeEnd: number
}

const DEFAULT_PAGE_SIZE = 25

export function useTableControls<T>(
  allRows: T[],
  config: TableControlsConfig<T>,
): TableControls<T> {
  const [search, setSearchRaw] = useState("")
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    config.defaultSort ?? null,
  )
  const [page, setPageRaw] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(config.pageSize ?? DEFAULT_PAGE_SIZE)

  const facets = config.facets ?? []
  const sortableKeys = useMemo(() => new Set(Object.keys(config.sorts ?? {})), [config.sorts])

  // Distinct option values per facet (sorted, from the FULL set so options are
  // stable regardless of the current filter).
  const facetOptions = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const f of facets) {
      const set = new Set<string>()
      for (const row of allRows) {
        const v = f.accessor(row)
        if (v != null && v !== "") set.add(String(v))
      }
      out[f.key] = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    return out
  }, [allRows, facets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter((row) => {
      if (q && config.searchText) {
        if (!config.searchText(row).toLowerCase().includes(q)) return false
      }
      for (const f of facets) {
        const chosen = selected[f.key]
        if (chosen && chosen.size > 0) {
          const v = f.accessor(row)
          if (v == null || !chosen.has(String(v))) return false
        }
      }
      return true
    })
  }, [allRows, search, selected, facets, config])

  const sorted = useMemo(() => {
    if (!sort || !config.sorts?.[sort.key]) return filtered
    const val = config.sorts[sort.key]
    const dir = sort.dir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filtered, sort, config.sorts])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const rows = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, clampedPage, pageSize])

  const rangeStart = sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const rangeEnd = Math.min(clampedPage * pageSize, sorted.length)

  const activeChips = useMemo(() => {
    const chips: { facetKey: string; facetLabel: string; value: string }[] = []
    for (const f of facets) {
      const chosen = selected[f.key]
      if (chosen) for (const value of chosen) chips.push({ facetKey: f.key, facetLabel: f.label, value })
    }
    return chips
  }, [facets, selected])

  const hasActiveFilters = search.trim() !== "" || activeChips.length > 0

  function setSearch(v: string) {
    setSearchRaw(v)
    setPageRaw(1)
  }
  function setPage(p: number) {
    setPageRaw(Math.min(Math.max(1, p), pageCount))
  }
  function setPageSize(n: number) {
    setPageSizeRaw(n)
    setPageRaw(1)
  }
  function toggleFacet(facetKey: string, value: string) {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[facetKey] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      next[facetKey] = set
      return next
    })
    setPageRaw(1)
  }
  function clearFacet(facetKey: string) {
    setSelected((prev) => {
      const next = { ...prev }
      delete next[facetKey]
      return next
    })
    setPageRaw(1)
  }
  function resetAll() {
    setSearchRaw("")
    setSelected({})
    setPageRaw(1)
  }
  function toggleSort(key: string) {
    if (!sortableKeys.has(key)) return
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" }
      if (prev.dir === "asc") return { key, dir: "desc" }
      return null // third click clears sort
    })
    setPageRaw(1)
  }

  return {
    rows,
    total: allRows.length,
    filteredTotal: sorted.length,
    search,
    setSearch,
    facets,
    facetOptions,
    selected,
    toggleFacet,
    clearFacet,
    activeChips,
    hasActiveFilters,
    resetAll,
    sort,
    toggleSort,
    sortableKeys,
    page: clampedPage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    rangeStart,
    rangeEnd,
  }
}
