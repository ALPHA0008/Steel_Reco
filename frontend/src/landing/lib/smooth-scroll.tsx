import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import Lenis from "lenis"

/**
 * Lenis smooth (momentum) scrolling, scoped to the landing route only.
 * Lenis scrolls the window natively, so Framer Motion's useScroll stays in
 * sync for the progress bar. Destroyed on unmount so the in-app tool (which
 * wants plain, instant scrolling in dense grids) is never affected.
 */
const LenisContext = createContext<Lenis | null>(null)

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return // honor reduced-motion — native scrolling, no hijack

    const instance = new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.5 })
    setLenis(instance)

    function loop(time: number) {
      instance.raf(time)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      instance.destroy()
      setLenis(null)
    }
  }, [])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}

/** Smooth-scroll to an anchor (#id), accounting for the fixed nav. Falls back
 * to native scrollIntoView when Lenis is off (reduced-motion). */
export function useScrollTo() {
  const lenis = useContext(LenisContext)
  return (hash: string) => {
    const el = document.querySelector(hash)
    if (!el) return
    if (lenis) lenis.scrollTo(el as HTMLElement, { offset: -72 })
    else el.scrollIntoView({ behavior: "smooth" })
  }
}
