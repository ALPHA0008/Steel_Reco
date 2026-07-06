/**
 * Hero backdrop for a steel-reconciliation tool. Not a generic grid: vertical
 * "rebar" tracks with a light that falls down each one, like the tool scanning a
 * column row by row, over a fine dot field that fades to white at the edges, with
 * a soft breathing glow behind the title. One brand-red accent, steel-blue depth.
 * Reduced-motion safe (all animation classes disable via index.css).
 */

// Beam tracks spread across the width, each falling at its own pace/offset so the
// field never pulses in unison.
const BEAMS = [
  { left: "12%", dur: "7.5s", delay: "0s", h: "20%" },
  { left: "26%", dur: "9s", delay: "1.6s", h: "16%" },
  { left: "40%", dur: "6.5s", delay: "0.8s", h: "22%" },
  { left: "58%", dur: "8.5s", delay: "2.4s", h: "18%" },
  { left: "72%", dur: "7s", delay: "1.1s", h: "20%" },
  { left: "86%", dur: "9.5s", delay: "0.3s", h: "15%" },
]

export function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Fine dot field, radially masked so it dissolves into white. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(35,36,37,0.10) 1px, transparent 1.4px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 62% 58% at 50% 42%, black 0%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 62% 58% at 50% 42%, black 0%, transparent 80%)",
        }}
      />

      {/* Vertical rebar tracks — faint full-height lines. */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, black 0%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, black 0%, transparent 85%)",
        }}
      >
        {BEAMS.map((b, i) => (
          <div key={i} className="absolute top-0 h-full w-px overflow-hidden bg-[rgba(35,36,37,0.06)]" style={{ left: b.left }}>
            {/* the falling highlight */}
            <div
              className="beam-fall absolute inset-x-0 rounded-full"
              style={
                {
                  height: b.h,
                  "--beam-dur": b.dur,
                  "--beam-delay": b.delay,
                  background:
                    i % 3 === 0
                      ? "linear-gradient(to bottom, transparent, rgba(42,90,133,0.55), transparent)"
                      : "linear-gradient(to bottom, transparent, rgba(215,0,40,0.65), transparent)",
                } as React.CSSProperties
              }
            />
          </div>
        ))}
      </div>

      {/* Soft breathing glow behind the title — brand red, warm. */}
      <div
        className="glow-breathe absolute left-1/2 top-[38%] h-[52vh] w-[52vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(215,0,40,0.14) 0%, transparent 68%)" }}
      />
      {/* Steel-blue depth, lower-left. */}
      <div
        className="aurora-b absolute -left-24 top-1/2 h-[48vh] w-[48vh] rounded-full opacity-70 blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(42,90,133,0.10) 0%, transparent 68%)" }}
      />

      {/* Nav blend + clean bottom hand-off to the next section. */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white" />
    </div>
  )
}
