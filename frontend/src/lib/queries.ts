import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  fetchAdminAnalytics,
  fetchAdminMasterSummary,
  fetchAdminSites,
  fetchAdminSiteSummary,
  fetchAdminSiteWastageTrend,
} from "./api"
import type {
  AbstractResponse,
  BbsPlan,
  BbsPlanCreate,
  FinalizeResponse,
  Contractor,
  DashboardSummary,
  DiaGrade,
  Element,
  DataHealthResponse,
  DraftAbstractRequest,
  DraftAbstractResponse,
  ExceptionLog,
  ExceptionResolutionType,
  Floor,
  Grn,
  GrnCreate,
  GrnPoSummaryRow,
  InterSiteTransfer,
  InterSiteTransferCreate,
  JmrActual,
  JmrActualCreate,
  PeriodBounds,
  WastageTrendResponse,
  MyHomeStock,
  MyHomeStockCreate,
  PhysicalCount,
  PhysicalCountCreate,
  Project,
  PurchaseOrder,
  PurchaseOrderCreate,
  ScrapSale,
  ScrapSaleCreate,
  StoreIssue,
  StoreIssueCreate,
  SupplierInvoice,
  SupplierInvoiceCreate,
  Tower,
  Vendor,
} from "./types"

/** Masters change rarely — cache them for the session. */
const MASTERS_STALE = 5 * 60 * 1000

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => (await api.get<Vendor[]>("/vendors")).data,
    staleTime: MASTERS_STALE,
  })
}

export function useContractors() {
  return useQuery({
    queryKey: ["contractors"],
    queryFn: async () => (await api.get<Contractor[]>("/contractors")).data,
    staleTime: MASTERS_STALE,
  })
}

export function useDiaGrades() {
  return useQuery({
    queryKey: ["dia-grades"],
    queryFn: async () => {
      const rows = (await api.get<DiaGrade[]>("/dia-grades")).data
      return rows
        .slice()
        .sort((a, b) => parseFloat(a.diameter_mm) - parseFloat(b.diameter_mm))
    },
    staleTime: MASTERS_STALE,
  })
}

// ---- GRN ----

export function useGrns() {
  return useQuery({
    queryKey: ["grn"],
    queryFn: async () => (await api.get<Grn[]>("/grn")).data,
  })
}

/** Groups every GRN by its raw po_reference text -- honest visibility into
 * receiving structure while no real PO master data is linked (linked_count
 * is 0 for every row today). */
export function useGrnPoSummary() {
  return useQuery({
    queryKey: ["grn-po-summary"],
    queryFn: async () => (await api.get<GrnPoSummaryRow[]>("/grn/po-summary")).data,
  })
}

export function useCreateGrn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: GrnCreate) => (await api.post<Grn>("/grn", payload)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["grn"] })
    },
  })
}

// ---- Structure ----

export function useMyProject() {
  return useQuery({
    queryKey: ["project-me"],
    queryFn: async () => (await api.get<Project>("/projects/me")).data,
    staleTime: MASTERS_STALE,
  })
}

export function useTowers() {
  return useQuery({
    queryKey: ["towers"],
    queryFn: async () => (await api.get<Tower[]>("/towers")).data,
    staleTime: MASTERS_STALE,
  })
}

export function useFloors(towerId: string | undefined) {
  return useQuery({
    queryKey: ["floors", towerId],
    queryFn: async () => (await api.get<Floor[]>(`/towers/${towerId}/floors`)).data,
    enabled: Boolean(towerId),
    staleTime: MASTERS_STALE,
  })
}

export function useElements(floorId: string | undefined) {
  return useQuery({
    queryKey: ["elements", floorId],
    queryFn: async () => (await api.get<Element[]>(`/floors/${floorId}/elements`)).data,
    enabled: Boolean(floorId),
    staleTime: MASTERS_STALE,
  })
}

// ---- Generic list/create factory: every transaction router follows the
// same GET ""/POST "" shape, so the hooks are stamped from one pattern. ----

function makeHooks<TRow, TCreate>(key: string, path: string) {
  function useList() {
    return useQuery({
      queryKey: [key],
      queryFn: async () => (await api.get<TRow[]>(path)).data,
    })
  }
  function useCreate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (payload: TCreate) => (await api.post<TRow>(path, payload)).data,
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [key] })
      },
    })
  }
  return { useList, useCreate }
}

const storeIssueHooks = makeHooks<StoreIssue, StoreIssueCreate>("store-issues", "/store-issues")
export const useStoreIssues = storeIssueHooks.useList
export const useCreateStoreIssue = storeIssueHooks.useCreate

const transferHooks = makeHooks<InterSiteTransfer, InterSiteTransferCreate>(
  "inter-site-transfers",
  "/inter-site-transfers",
)
export const useTransfers = transferHooks.useList
export const useCreateTransfer = transferHooks.useCreate

const bbsHooks = makeHooks<BbsPlan, BbsPlanCreate>("bbs-plans", "/bbs-plans")
export const useBbsPlans = bbsHooks.useList
export const useCreateBbsPlan = bbsHooks.useCreate

const jmrHooks = makeHooks<JmrActual, JmrActualCreate>("jmr-actuals", "/jmr-actuals")
export const useJmrActuals = jmrHooks.useList
export const useCreateJmrActual = jmrHooks.useCreate

const pcHooks = makeHooks<PhysicalCount, PhysicalCountCreate>("physical-counts", "/physical-counts")
export const usePhysicalCounts = pcHooks.useList
export const useCreatePhysicalCount = pcHooks.useCreate

const myhomeStockHooks = makeHooks<MyHomeStock, MyHomeStockCreate>("myhome-stock", "/myhome-stock")
export const useMyHomeStock = myhomeStockHooks.useList
export const useCreateMyHomeStock = myhomeStockHooks.useCreate

const scrapHooks = makeHooks<ScrapSale, ScrapSaleCreate>("scrap-sales", "/scrap-sales")
export const useScrapSales = scrapHooks.useList
export const useCreateScrapSale = scrapHooks.useCreate

// ---- Upstream documents (plan §3.5) ----

const poHooks = makeHooks<PurchaseOrder, PurchaseOrderCreate>("purchase-orders", "/purchase-orders")
export const usePurchaseOrders = poHooks.useList
export const useCreatePurchaseOrder = poHooks.useCreate

const invoiceHooks = makeHooks<SupplierInvoice, SupplierInvoiceCreate>(
  "supplier-invoices",
  "/supplier-invoices",
)
export const useSupplierInvoices = invoiceHooks.useList
export const useCreateSupplierInvoice = invoiceHooks.useCreate

// ---- Exceptions ----

export function useExceptions(status?: string) {
  return useQuery({
    queryKey: ["exceptions", status ?? "all"],
    queryFn: async () =>
      (await api.get<ExceptionLog[]>("/exceptions", { params: status ? { status } : {} })).data,
  })
}

export function useResolveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      resolution_type: ExceptionResolutionType
      reason: string
      /** Required for follow_up; the backend refuses a past date or one beyond
       *  the close horizon, so a rejection here is expected, not exceptional. */
      follow_up_due_date?: string
    }) =>
      (
        await api.post<ExceptionLog>(`/exceptions/${p.id}/resolve`, {
          resolution_type: p.resolution_type,
          reason: p.reason,
          follow_up_due_date: p.follow_up_due_date ?? null,
        })
      ).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["exceptions"] })
    },
  })
}

// ---- Dashboard ----

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard/summary")).data,
  })
}

// ---- Abstract & month close ----

export function useAbstract(year: number, month: number) {
  return useQuery({
    queryKey: ["abstract", year, month],
    queryFn: async () =>
      (await api.get<AbstractResponse>("/abstract", { params: { year, month } })).data,
  })
}

/** Bounds the Abstract's period picker to months that actually have ledger
 * activity (never let the UI imply a month has data it doesn't). */
export function usePeriodBounds() {
  return useQuery({
    queryKey: ["abstract-period-bounds"],
    queryFn: async () => (await api.get<PeriodBounds>("/abstract/period-bounds")).data,
    staleTime: MASTERS_STALE,
  })
}

/** Quick Draft: type A-N per diameter, get the same derived math + finding
 * rules the real Abstract runs -- a stateless POST, nothing is ever saved. */
export function useDraftAbstract() {
  return useMutation({
    mutationFn: async (payload: DraftAbstractRequest) =>
      (await api.post<DraftAbstractResponse>("/abstract/draft", payload)).data,
  })
}

/** Cumulative wastage % as of every month-end with real activity -- powers
 * the dashboard's wastage trend chart. */
export function useWastageTrend() {
  return useQuery({
    queryKey: ["abstract-wastage-trend"],
    queryFn: async () => (await api.get<WastageTrendResponse>("/abstract/wastage-trend")).data,
    staleTime: MASTERS_STALE,
  })
}

// ---- Admin multi-site dashboard (admin-only endpoints) ----

/** All real sites with their current headline numbers -- the admin dashboard.
 * The backend serves summaries fast (~1s) and fills in each site's sparkline a
 * moment later (background trend warm). While any sparkline is still empty, we
 * poll briefly so the sparklines pop in without a manual refresh, then stop. */
export function useAdminSites() {
  return useQuery({
    queryKey: ["admin-sites"],
    queryFn: fetchAdminSites,
    staleTime: 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || data.length === 0) return false
      const anyMissingSpark = data.some((s) => (s.wastage_spark?.length ?? 0) === 0 && s.wastage_pct != null)
      // Keep polling every 2.5s until every site that has a wastage figure also
      // has its sparkline; then stop.
      return anyMissingSpark ? 2500 : false
    },
  })
}

/** Company-wide roll-up across every real site. */
export function useAdminMasterSummary() {
  return useQuery({
    queryKey: ["admin-master-summary"],
    queryFn: fetchAdminMasterSummary,
    staleTime: 60 * 1000,
  })
}

/** The single rich executive-analytics payload powering the redesigned admin
 * dashboard (portfolio health, insights, every visualization's data). */
export function useAdminAnalytics() {
  return useQuery({
    queryKey: ["admin-analytics"],
    queryFn: fetchAdminAnalytics,
    staleTime: 60 * 1000,
  })
}

/** One site's current-month headline numbers (admin-scoped). */
export function useAdminSiteSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: ["admin-site-summary", projectId],
    queryFn: () => fetchAdminSiteSummary(projectId as string),
    enabled: Boolean(projectId),
  })
}

/** One site's full wastage trend (admin-scoped). */
export function useAdminSiteWastageTrend(projectId: string | undefined) {
  return useQuery({
    queryKey: ["admin-site-wastage-trend", projectId],
    queryFn: () => fetchAdminSiteWastageTrend(projectId as string),
    enabled: Boolean(projectId),
    staleTime: MASTERS_STALE,
  })
}

/** Per-section data-completeness panel -- what's real, aggregate, synthetic,
 * or known-stale, plus PO-linkage % and exception counts. */
export function useDataHealth() {
  return useQuery({
    queryKey: ["abstract-data-health"],
    queryFn: async () => (await api.get<DataHealthResponse>("/abstract/data-health")).data,
  })
}

export function useFinalizeMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { year: number; month: number }) =>
      (await api.post<FinalizeResponse>("/month-close/finalize", p)).data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ["abstract", p.year, p.month] })
    },
  })
}

export function useReopenMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { year: number; month: number; reason: string }) => {
      await api.post("/month-close/reopen", p)
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ["abstract", p.year, p.month] })
    },
  })
}

// ---- Shared display helpers ----

export function diaLabel(dia: DiaGrade | undefined): string {
  if (!dia) return "—"
  return `${parseFloat(dia.diameter_mm)} mm`
}

export function formatKg(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}
