import { cn } from "@/lib/utils"

const NAME = "Niṣṭhā" // precomposed: ṣ U+1E63, ṭ U+1E6D, ā U+0101

/**
 * The product wordmark. One place so the name renders identically everywhere.
 *
 * Rendered as per-character spans (the same shaping path the large hero title
 * uses, which renders the ā macron correctly) in the display face, so the small
 * nav/login instances never show a detached, misplaced macron from whole-run
 * shaping or a fallback font.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.01em]", className)} aria-label={NAME}>
      {[...NAME].map((ch, i) => (
        <span key={i} aria-hidden className="inline-block">
          {ch}
        </span>
      ))}
    </span>
  )
}
