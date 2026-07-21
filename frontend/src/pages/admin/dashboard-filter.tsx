import { createContext, useContext } from "react"
import type { AnalyticsSite } from "@/lib/types"

/**
 * Cross-filter state for the admin dashboard. A single selected site scopes
 * the entire dashboard (KPIs, narrative, charts, timeline) -- the Palantir/BI
 * "click anything to filter everything" behaviour. `null` = whole portfolio.
 *
 * We filter by site (the dimension every visualization shares). Clicking a
 * bubble, treemap cell, heatmap row, table row, or alert sets it; a chip in the
 * filter bar clears it.
 */
export interface DashboardFilter {
  siteId: string | null
  setSiteId: (id: string | null) => void
  /** convenience: is this site the active filter (or is there no filter)? */
  isActive: (id: string) => boolean
}

export const FilterContext = createContext<DashboardFilter>({
  siteId: null,
  setSiteId: () => {},
  isActive: () => true,
})

export function useDashboardFilter(): DashboardFilter {
  return useContext(FilterContext)
}

/** Apply the active site filter to a site list (identity when unfiltered). */
export function applyFilter(sites: AnalyticsSite[], siteId: string | null): AnalyticsSite[] {
  if (!siteId) return sites
  return sites.filter((s) => s.project_id === siteId)
}
