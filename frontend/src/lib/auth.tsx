import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
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

  const login = useCallback(async (username: string, password: string) => {
    const token = await apiLogin(username, password)
    setToken(token)
    const me = await fetchMe()
    setUser(me)
  }, [])

  const signup = useCallback(async (payload: SignupPayload) => {
    const token = await apiSignup(payload)
    setToken(token)
    const me = await fetchMe()
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

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
