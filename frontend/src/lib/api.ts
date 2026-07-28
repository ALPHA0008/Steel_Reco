import axios, { AxiosError } from "axios"

/**
 * API client for the FastAPI backend.
 * Dev: Vite proxies /api -> http://localhost:8000 (no CORS needed).
 * Auth: JWT bearer from localStorage; 401 clears the session and returns to /login.
 * Errors: backend envelope is {"error": {"code", "message", "details"}} (422 rule
 * violations, 409 month-locked, 403 tenant) — apiErrorMessage() flattens any shape.
 */
export const api = axios.create({
  baseURL: "/api/v1",
})

const TOKEN_KEY = "steel_recon_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.includes("/auth/login")) {
      clearToken()
      if (window.location.pathname !== "/login") {
        window.location.assign("/login")
      }
    }
    return Promise.reject(error)
  },
)

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown }
  detail?: string | Array<{ loc?: (string | number)[]; msg?: string }>
}

/** Human-readable message from any backend error shape. */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ErrorEnvelope | undefined
    if (data?.error?.message) return data.error.message
    if (typeof data?.detail === "string") return data.detail
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg
    if (err.code === "ERR_NETWORK") return "Cannot reach the server. Is the backend running?"
  }
  return fallback
}

/**
 * The ECC envelope's machine-readable `error.code`, when there is one.
 *
 * Lets a caller branch on *which* rejection it got rather than only showing the
 * message — e.g. a refused correction (`correction_not_verified`) must keep its
 * dialog open with the typed reason intact, while a genuine failure closes it.
 */
export function apiErrorCode(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as ErrorEnvelope | undefined)?.error?.code ?? null
  }
  return null
}

/** Per-field messages from a FastAPI/Pydantic 422 (for inline form errors). */
export function apiFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (axios.isAxiosError(err) && Array.isArray((err.response?.data as ErrorEnvelope)?.detail)) {
    for (const item of (err.response!.data as ErrorEnvelope).detail as Array<{
      loc?: (string | number)[]
      msg?: string
    }>) {
      const field = item.loc?.[item.loc.length - 1]
      if (typeof field === "string" && item.msg) out[field] = item.msg
    }
  }
  return out
}

// ---- Auth ----

export interface CurrentUser {
  id: string
  username: string
  full_name: string
  role: string
  project_id: string | null
}

export async function login(username: string, password: string): Promise<string> {
  // OAuth2PasswordRequestForm expects form-encoded fields.
  const body = new URLSearchParams({ username, password })
  const res = await api.post<{ access_token: string }>("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  return res.data.access_token
}

export async function fetchMe(): Promise<CurrentUser> {
  const res = await api.get<CurrentUser>("/auth/me")
  return res.data
}

export interface ProjectPicker {
  id: string
  name: string
}

/** Public, unauthenticated -- feeds the signup page's project picker. */
export async function fetchProjectsForSignup(): Promise<ProjectPicker[]> {
  const res = await api.get<ProjectPicker[]>("/projects")
  return res.data
}

export interface SignupPayload {
  username: string
  email: string
  password: string
  full_name: string
  project_id: string
  signup_code: string
}

export async function signup(payload: SignupPayload): Promise<string> {
  const res = await api.post<{ access_token: string }>("/auth/signup", payload)
  return res.data.access_token
}

// ---- Admin ----

export interface AdminUser {
  id: string
  username: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
  project_id: string | null
  project_name: string | null
}

export interface AdminAuditEntry {
  id: string
  action: string
  table_name: string
  row_id: string | null
  project_id: string | null
  created_at: string
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await api.get<AdminUser[]>("/admin/users")
  return res.data
}

export async function fetchAdminUserActivity(userId: string): Promise<AdminAuditEntry[]> {
  const res = await api.get<AdminAuditEntry[]>(`/admin/users/${userId}/activity`)
  return res.data
}

export async function deactivateAdminUser(userId: string): Promise<AdminUser> {
  const res = await api.post<AdminUser>(`/admin/users/${userId}/deactivate`)
  return res.data
}

export async function reactivateAdminUser(userId: string): Promise<AdminUser> {
  const res = await api.post<AdminUser>(`/admin/users/${userId}/reactivate`)
  return res.data
}

// ---- Admin multi-site dashboard ----

export async function fetchAdminSites(): Promise<import("./types").AdminSiteSummary[]> {
  const res = await api.get<import("./types").AdminSiteSummary[]>("/admin/sites")
  return res.data
}

export async function fetchAdminMasterSummary(): Promise<import("./types").AdminMasterSummary> {
  const res = await api.get<import("./types").AdminMasterSummary>("/admin/master-summary")
  return res.data
}

export async function fetchAdminAnalytics(): Promise<import("./types").AdminAnalytics> {
  const res = await api.get<import("./types").AdminAnalytics>("/admin/analytics")
  return res.data
}

export async function fetchAdminSiteSummary(
  projectId: string,
): Promise<import("./types").DashboardSummary> {
  const res = await api.get<import("./types").DashboardSummary>(`/admin/sites/${projectId}/dashboard-summary`)
  return res.data
}

export async function fetchAdminSiteWastageTrend(
  projectId: string,
): Promise<import("./types").WastageTrendResponse> {
  const res = await api.get<import("./types").WastageTrendResponse>(`/admin/sites/${projectId}/wastage-trend`)
  return res.data
}

// ---- Abstract export ----

/** Downloads the Abstract as an .xlsx in the A-N x diameter layout the QS
 * already knows, and triggers the browser's save dialog -- same figures as
 * the on-screen Abstract, generated from the ledger, never typed. */
export async function downloadAbstractXlsx(year: number, month: number): Promise<void> {
  const res = await api.get(`/abstract/export`, {
    params: { year, month },
    responseType: "blob",
  })
  const disposition = res.headers["content-disposition"] as string | undefined
  const match = disposition?.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? `Steel_Abstract_${year}-${String(month).padStart(2, "0")}.xlsx`

  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function setProjectSignupCode(projectId: string, code?: string): Promise<{ signup_code: string }> {
  const res = await api.post<{ project_id: string; signup_code: string }>(
    `/admin/projects/${projectId}/signup-code`,
    code ? { signup_code: code } : {},
  )
  return res.data
}
