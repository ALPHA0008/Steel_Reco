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
