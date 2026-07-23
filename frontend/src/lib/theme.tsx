import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

/**
 * Theme preference: "system" tracks the OS setting live; "light"/"dark" pin it.
 * The initial class is applied by the inline script in index.html (no flash);
 * this provider keeps it in sync and persists the choice.
 */
export type ThemePref = "light" | "dark" | "system"

const STORAGE_KEY = "theme"

interface ThemeContextValue {
  /** the user's stored preference */
  theme: ThemePref
  /** the theme actually showing right now (system resolved to light/dark) */
  resolved: "light" | "dark"
  setTheme: (t: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    /* ignore */
  }
  return "system"
}

function apply(pref: ThemePref): "light" | "dark" {
  const isDark = pref === "dark" || (pref === "system" && prefersDark())
  const root = document.documentElement
  root.classList.toggle("dark", isDark)
  root.setAttribute("data-theme", isDark ? "dark" : "light")
  return isDark ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => readStored())
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  )

  // Re-apply whenever the preference changes.
  useEffect(() => {
    setResolved(apply(theme))
  }, [theme])

  // While in "system" mode, follow live OS changes.
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setResolved(apply("system"))
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = useCallback((t: ThemePref) => {
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
    setThemeState(t)
  }, [])

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>")
  return ctx
}
