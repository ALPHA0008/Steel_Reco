import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Hero backdrop — a reconciliation-network motif grounded in the actual domain:
 * a faint site blueprint, the six data sources (SITE, ERP, STORE, BBS, VENDOR,
 * INV) feeding red packets into a central reconciliation core that pulses each
 * time records land, source nodes orbiting it, floating reconciliation metrics,
 * and scattered construction metadata. Steel-blue structure + one brand-red
 * accent. Motion lives in index.css and is reduced-motion safe.
 */

const RED = "#ed1c24"

/* ---------- Layer 1: blueprint floorplan ---------- */
function BlueprintLayer() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.05]" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <rect x="350" y="180" width="900" height="500" fill="none" stroke="#0f172a" strokeWidth="1" />
      <line x1="800" y1="180" x2="800" y2="680" stroke="#0f172a" strokeWidth="1" />
      <line x1="350" y1="430" x2="1250" y2="430" stroke="#0f172a" strokeWidth="1" />
      <line x1="320" y1="180" x2="320" y2="680" stroke="#0f172a" strokeWidth="1" />
      <line x1="312" y1="180" x2="328" y2="180" stroke="#0f172a" strokeWidth="1" />
      <line x1="312" y1="680" x2="328" y2="680" stroke="#0f172a" strokeWidth="1" />
      <text x="150" y="434" fontSize="13" fill="#0f172a" fontFamily="monospace">12000 mm</text>
      <text x="360" y="205" fontSize="12" fill="#0f172a" fontFamily="monospace">TOWER 4 · SLAB L12</text>
    </svg>
  )
}

/* ---------- Layer 3: data convergence — sources feed packets into the core ----------
   Each source sits at a % position; its curve ends at the core (800,405 in the
   1600x900 viewBox). x,y are percent so the source label and the path stay in
   sync. */
const SOURCES = [
  { id: "vendor", label: "VENDOR", x: 20, y: 22 },
  { id: "site", label: "SITE", x: 15, y: 42 },
  { id: "store", label: "STORE", x: 22, y: 66 },
  { id: "inv", label: "INV", x: 80, y: 22 },
  { id: "erp", label: "ERP", x: 85, y: 44 },
  { id: "bbs", label: "BBS", x: 78, y: 68 },
]
const CORE = { x: 800, y: 405 }

function DataFlowLayer() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <g opacity="0.55">
        {SOURCES.map((s) => {
          const sx = s.x * 16
          const sy = s.y * 9
          // Control point pulled toward the core for a gentle intake curve.
          const cx = (sx + CORE.x) / 2
          const cy = CORE.y
          return (
            <path
              key={s.id}
              id={`flow-${s.id}`}
              d={`M ${sx} ${sy} Q ${cx} ${cy} ${CORE.x} ${CORE.y}`}
              fill="none"
              stroke="rgba(42,90,133,0.20)"
              strokeWidth="1"
            />
          )
        })}
      </g>
      {SOURCES.map((s, i) => (
        <circle key={`${s.id}-dot`} r="3.5" fill={RED}>
          <animateMotion dur={`${6 + i * 0.6}s`} begin={`${i * 0.8}s`} repeatCount="indefinite">
            <mpath href={`#flow-${s.id}`} />
          </animateMotion>
        </circle>
      ))}
    </svg>
  )
}

/* ---------- Layer 2: source node labels (anchored at each source position) ---------- */
function SourceNodes() {
  return (
    <>
      {SOURCES.map((s) => (
        <div
          key={s.id}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          <span className="text-[9.5px] font-semibold tracking-[0.28em] text-slate-400">{s.label}</span>
        </div>
      ))}
    </>
  )
}

/* ---------- Layer 4: reconciliation core, reacts when packets land ---------- */
function IntelligenceCore() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      setActive(true)
      setTimeout(() => setActive(false), 600)
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2">
      {/* concentric rings, slow counter-rotation */}
      <div className="ring-spin absolute h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:rgba(237,28,36,0.12)]" />
      <div className="ring-spin-reverse absolute h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:rgba(237,28,36,0.10)]" />
      <div className="ring-spin absolute h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:rgba(237,28,36,0.08)]" />
      {/* soft breathing glow */}
      <div
        className="core-pulse absolute h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(237,28,36,0.18), transparent 70%)" }}
      />
      {/* center dot — jumps in scale each time records land */}
      <div
        className={cn(
          "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-500 ease-out",
          active && "scale-[1.8]",
        )}
        style={{ background: RED, boxShadow: "0 0 18px rgba(237,28,36,0.6), 0 0 50px rgba(237,28,36,0.28)" }}
      />
    </div>
  )
}

/* ---------- Layer 6: floating reconciliation metrics ---------- */
const METRICS = [
  { title: "Steel Matched", value: "98.7%", x: "50%", y: "16%", floatDur: "9s", floatDelay: "0s" },
  { title: "Variance", value: "0.3%", x: "72%", y: "80%", floatDur: "10.5s", floatDelay: "1.5s" },
  { title: "Records", value: "1.2M", x: "30%", y: "84%", floatDur: "8.5s", floatDelay: "0.8s" },
]

function FloatingMetrics() {
  return (
    <>
      {METRICS.map((m) => (
        <div
          key={m.title}
          className="metric-float absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: m.x, top: m.y, ["--float-dur" as string]: m.floatDur, ["--float-delay" as string]: m.floatDelay }}
        >
          <div className="rounded-2xl border border-white/70 bg-white/55 px-4 py-3 shadow-[0_12px_32px_rgba(20,20,22,0.10)] backdrop-blur-xl">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{m.title}</div>
            <div className="font-display mt-0.5 text-[22px] font-semibold tracking-tight text-foreground">{m.value}</div>
          </div>
        </div>
      ))}
    </>
  )
}

/* ---------- Layer 7: construction metadata scatter ---------- */
const META = ["BBS-3412", "STEEL-16MM", "PO-8821", "INV-0012", "SITE-A", "GRN-0431"]

function ConstructionMetadata() {
  return (
    <>
      {META.map((item, i) => (
        <div
          key={item}
          className="absolute font-mono text-[10px] tracking-[0.4em] text-slate-400 opacity-[0.16]"
          style={{ left: `${10 + i * 15}%`, top: `${20 + (i % 3) * 25}%` }}
        >
          {item}
        </div>
      ))}
    </>
  )
}

export function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white" aria-hidden>
      <BlueprintLayer />
      <DataFlowLayer />
      <SourceNodes />
      <IntelligenceCore />
      <FloatingMetrics />
      <ConstructionMetadata />

      {/* Premium noise — barely-there grain so the white canvas is not sterile. */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url('data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\"%3E%3Cfilter id=\"n\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\"/%3E%3C/filter%3E%3Crect width=\"120\" height=\"120\" filter=\"url(%23n)\" opacity=\"0.8\"/%3E%3C/svg%3E')",
        }}
      />

      {/* Keep the busy field away from the title and the section seams. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 40% 38% at 50% 45%, rgba(255,255,255,0.8) 0%, transparent 70%)" }}
      />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white via-white/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white via-white/70 to-transparent" />
    </div>
  )
}
