import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "./api"
import type {
  AbstractResponse,
  BbsPlan,
  BbsPlanCreate,
  FinalizeResponse,
  Contractor,
  DashboardSummary,
  DiaGrade,
  Element,
  ExceptionLog,
  ExceptionResolutionType,
  Floor,
  Grn,
  GrnCreate,
  InterSiteTransfer,
  InterSiteTransferCreate,
  JmrActual,
  JmrActualCreate,
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
    mutationFn: async (p: { id: string; resolution_type: ExceptionResolutionType; reason: string }) =>
      (
        await api.post<ExceptionLog>(`/exceptions/${p.id}/resolve`, {
          resolution_type: p.resolution_type,
          reason: p.reason,
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
