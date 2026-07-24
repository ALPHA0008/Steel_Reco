import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider, RequireAuth, RequireAdmin, RequireQS, RoleHome } from "@/lib/auth"
import { ThemeProvider } from "@/lib/theme"
import { AppShell } from "@/components/layout/AppShell"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"

// Landing page is lazy — it pulls in Framer Motion + Lenis + Fraunces, none of
// which the authenticated tool needs. Keeps the app bundle lean.
const LandingPage = lazy(() => import("@/landing/LandingPage"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

// Route-level code splitting: every page beyond login/shell loads on demand,
// so the initial bundle stays small regardless of how many transaction
// screens the app grows to.
const StyleguidePage = lazy(() => import("@/pages/StyleguidePage").then((m) => ({ default: m.StyleguidePage })))
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })))
const ExceptionsInboxPage = lazy(() =>
  import("@/pages/exceptions/ExceptionsInboxPage").then((m) => ({ default: m.ExceptionsInboxPage })),
)
const PurchaseOrderListPage = lazy(() =>
  import("@/pages/purchase-orders/PurchaseOrderListPage").then((m) => ({ default: m.PurchaseOrderListPage })),
)
const PurchaseOrderNewPage = lazy(() =>
  import("@/pages/purchase-orders/PurchaseOrderNewPage").then((m) => ({ default: m.PurchaseOrderNewPage })),
)
const InvoiceListPage = lazy(() =>
  import("@/pages/invoices/InvoiceListPage").then((m) => ({ default: m.InvoiceListPage })),
)
const InvoiceNewPage = lazy(() =>
  import("@/pages/invoices/InvoiceNewPage").then((m) => ({ default: m.InvoiceNewPage })),
)
const GrnListPage = lazy(() => import("@/pages/grn/GrnListPage").then((m) => ({ default: m.GrnListPage })))
const GrnNewPage = lazy(() => import("@/pages/grn/GrnNewPage").then((m) => ({ default: m.GrnNewPage })))
const StoreIssueListPage = lazy(() =>
  import("@/pages/store-issues/StoreIssueListPage").then((m) => ({ default: m.StoreIssueListPage })),
)
const StoreIssueNewPage = lazy(() =>
  import("@/pages/store-issues/StoreIssueNewPage").then((m) => ({ default: m.StoreIssueNewPage })),
)
const TransferListPage = lazy(() =>
  import("@/pages/transfers/TransferListPage").then((m) => ({ default: m.TransferListPage })),
)
const TransferNewPage = lazy(() =>
  import("@/pages/transfers/TransferNewPage").then((m) => ({ default: m.TransferNewPage })),
)
const BbsListPage = lazy(() => import("@/pages/bbs/BbsListPage").then((m) => ({ default: m.BbsListPage })))
const BbsNewPage = lazy(() => import("@/pages/bbs/BbsNewPage").then((m) => ({ default: m.BbsNewPage })))
const JmrListPage = lazy(() => import("@/pages/jmr/JmrListPage").then((m) => ({ default: m.JmrListPage })))
const JmrNewPage = lazy(() => import("@/pages/jmr/JmrNewPage").then((m) => ({ default: m.JmrNewPage })))
const PhysicalCountListPage = lazy(() =>
  import("@/pages/physical-counts/PhysicalCountListPage").then((m) => ({ default: m.PhysicalCountListPage })),
)
const PhysicalCountNewPage = lazy(() =>
  import("@/pages/physical-counts/PhysicalCountNewPage").then((m) => ({ default: m.PhysicalCountNewPage })),
)
const MyHomeStockListPage = lazy(() =>
  import("@/pages/myhome-stock/MyHomeStockListPage").then((m) => ({ default: m.MyHomeStockListPage })),
)
const MyHomeStockNewPage = lazy(() =>
  import("@/pages/myhome-stock/MyHomeStockNewPage").then((m) => ({ default: m.MyHomeStockNewPage })),
)
const ScrapListPage = lazy(() => import("@/pages/scrap/ScrapListPage").then((m) => ({ default: m.ScrapListPage })))
const ScrapNewPage = lazy(() => import("@/pages/scrap/ScrapNewPage").then((m) => ({ default: m.ScrapNewPage })))
const AbstractPage = lazy(() => import("@/pages/abstract/AbstractPage").then((m) => ({ default: m.AbstractPage })))
const AbstractDraftPage = lazy(() =>
  import("@/pages/abstract/AbstractDraftPage").then((m) => ({ default: m.AbstractDraftPage })),
)
const DataHealthPage = lazy(() =>
  import("@/pages/data-health/DataHealthPage").then((m) => ({ default: m.DataHealthPage })),
)
const AdminUsersPage = lazy(() =>
  import("@/pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
)
const AdminDashboardPage = lazy(() =>
  import("@/pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })),
)
const AdminSitePage = lazy(() =>
  import("@/pages/admin/AdminSitePage").then((m) => ({ default: m.AdminSitePage })),
)

function RouteFallback() {
  return (
    <div className="grid h-full min-h-[60vh] place-items-center">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route
                  path="/dashboard"
                  element={<RoleHome qs={<DashboardPage />} admin={<AdminDashboardPage />} />}
                />
                {/* QS-only, project-scoped pages. Admins have no single project
                    and these endpoints reject them (400), so RequireQS bounces
                    an admin to /admin rather than showing a dead error page. */}
                <Route element={<RequireQS><Outlet /></RequireQS>}>
                  <Route path="/exceptions" element={<ExceptionsInboxPage />} />
                  <Route path="/purchase-orders" element={<PurchaseOrderListPage />} />
                  <Route path="/purchase-orders/new" element={<PurchaseOrderNewPage />} />
                  <Route path="/invoices" element={<InvoiceListPage />} />
                  <Route path="/invoices/new" element={<InvoiceNewPage />} />
                  <Route path="/grn" element={<GrnListPage />} />
                  <Route path="/grn/new" element={<GrnNewPage />} />
                  <Route path="/store-issues" element={<StoreIssueListPage />} />
                  <Route path="/store-issues/new" element={<StoreIssueNewPage />} />
                  <Route path="/transfers" element={<TransferListPage />} />
                  <Route path="/transfers/new" element={<TransferNewPage />} />
                  <Route path="/bbs" element={<BbsListPage />} />
                  <Route path="/bbs/new" element={<BbsNewPage />} />
                  <Route path="/jmr" element={<JmrListPage />} />
                  <Route path="/jmr/new" element={<JmrNewPage />} />
                  <Route path="/physical-counts" element={<PhysicalCountListPage />} />
                  <Route path="/physical-counts/new" element={<PhysicalCountNewPage />} />
                  <Route path="/myhome-stock" element={<MyHomeStockListPage />} />
                  <Route path="/myhome-stock/new" element={<MyHomeStockNewPage />} />
                  <Route path="/scrap" element={<ScrapListPage />} />
                  <Route path="/scrap/new" element={<ScrapNewPage />} />
                  <Route path="/abstract" element={<AbstractPage />} />
                  <Route path="/abstract/draft" element={<AbstractDraftPage />} />
                  <Route path="/data-health" element={<DataHealthPage />} />
                </Route>
                <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
                <Route path="/admin/sites/:projectId" element={<RequireAdmin><AdminSitePage /></RequireAdmin>} />
                <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
                <Route path="/styleguide" element={<StyleguidePage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
