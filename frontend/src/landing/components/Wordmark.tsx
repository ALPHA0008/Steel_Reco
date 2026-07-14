import { cn } from "@/lib/utils"

const NAME = "Digi Reco"

/** The product wordmark. One place so the name renders identically everywhere. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.01em]", className)}>{NAME}</span>
  )
}
