import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Navigate, useLocation } from "react-router-dom"
import {
  clearToken,
  fetchMe,
  getToken,
  login as apiLogin,
  signup as apiSignup,
  setToken,
  type CurrentUser,
  type SignupPayload,
} from "./api"

interface AuthState {
  user: CurrentUser | null
  /** true while restoring a persisted session on first load */
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (payload: SignupPayload) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()))

  // Restore session from a persisted token.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) clearToken()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Backstop: clear the cache whenever the signed-in identity changes, however
  // that happened. login()/logout() already clear at the two obvious points,
  // but those are explicit calls that a future code path could bypass -- a
  // token swapped in from elsewhere, a session restored as a different user.
  // Because the cache keys are per-resource rather than per-user, missing one
  // such path means showing one person another's project, so this watches the
  // identity itself instead of trusting every caller to remember.
  //
  // Skipped when the cache is already empty, so the normal login flow (which
  // cleared a moment earlier) doesn't clear twice and refetch needlessly.
  const lastIdentity = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const id = user?.id ?? null
    if (lastIdentity.current === id) return
    const isFirstObservation = lastIdentity.current === undefined
    lastIdentity.current = id
    if (isFirstObservation) return
    if (qc.getQueryCache().getAll().length > 0) qc.clear()
  }, [user?.id, qc])

  const login = useCallback(
    async (username: string, password: string) => {
      const token = await apiLogin(username, password)
      // Drop the previous account's cached responses BEFORE the new session
      // starts fetching. Every cached entry is scoped to whoever was signed in
      // -- keyed by resource, not by user -- so without this the incoming user
      // is served the last one's dashboard, project name and ledger rows from
      // cache while their own requests are still in flight.
      qc.clear()
      setToken(token)
      const me = await fetchMe()
      setUser(me)
    },
    [qc],
  )

  const signup = useCallback(
    async (payload: SignupPayload) => {
      const token = await apiSignup(payload)
      qc.clear()
      setToken(token)
      const me = await fetchMe()
      setUser(me)
    },
    [qc],
  )

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    // Also cleared on the way out, so a signed-out browser holds no project
    // data at all -- clearing only on login would leave the previous user's
    // figures sitting in memory for anyone who reopens the tab.
    qc.clear()
  }, [qc])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

/** Route guard: unauthenticated users land on /login (and return after). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/** Route guard for admin-only pages. A non-admin (a QS) who somehow lands on
 * an /admin route is redirected to their own dashboard rather than shown a
 * dead end. Assumes it sits inside RequireAuth, so `user` is already present. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

/** Route guard for QS-only (project-scoped) pages. Those endpoints reject an
 * admin (400 "must specify a project explicitly") because an admin has no
 * single project, so an admin landing on one — by typing the URL or an old
 * link — is sent to the admin dashboard instead of a dead 400 page. */
export function RequireQS({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user && user.role === "admin") {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}

/** The authenticated landing route (`/dashboard`). Admins don't have a single
 * project to show, so they're sent to the multi-site admin dashboard; QS users
 * see their project dashboard as before. */
export function RoleHome({ qs, admin }: { qs: ReactNode; admin: ReactNode }) {
  const { user } = useAuth()
  if (user?.role === "admin") return <>{admin}</>
  return <>{qs}</>
}
