import { useState } from "react"
import { cn } from "@/lib/utils"

/** Faithful SVG recreation of the My Home Group mark, used only if the real asset fails to load. */
function LogoMarkSvgFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-6", className)} role="img" aria-label="My Home Group">
      <circle cx="24" cy="24" r="21" fill="#ee3338" />
      <path d="M17.5 19.5 26 15v20h5v5H17v-5h5V22.2l-3.6 1.6-.9-4.3Z" fill="#ffffff" />
    </svg>
  )
}

/**
 * The My Home Group disc icon on its own, cropped from the real logo
 * (public/myhomegroup-mark.png) — no wordmark text, so it's safe to drop into
 * small square or circular slots (collapsed sidebar, social icon chips).
 */
export function LogoMark({ className }: { className?: string }) {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) return <LogoMarkSvgFallback className={className} />

  return (
    <img
      src="/myhomegroup-mark.png"
      alt="My Home Group"
      onError={() => setImgFailed(true)}
      className={cn("size-6 object-contain", className)}
    />
  )
}

/**
 * My Home Group brand mark in a white rounded box (MEDHA nav reference).
 *
 * Primary source is the official raster asset at `public/myhomegroup-logo.png`
 * (the white-background version the brand team supplies). If that file is not
 * present yet, we fall back to the disc-only mark so nothing looks broken.
 *
 * TO USE THE OFFICIAL ASSET: drop the white-background logo you have at
 *   frontend/public/myhomegroup-logo.png
 * and it is picked up automatically — no code change needed.
 */
export function Logo({ className, boxed = true }: { className?: string; boxed?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false)

  const art = imgFailed ? (
    <LogoMark className={className} />
  ) : (
    <img
      src="/myhomegroup-logo.png"
      alt="My Home Group"
      onError={() => setImgFailed(true)}
      className={cn("h-6 w-auto object-contain", className)}
    />
  )

  if (!boxed) return art

  return (
    <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-white px-2 shadow-[0_1px_3px_rgba(20,20,22,0.12)] ring-1 ring-black/[0.06]">
      {art}
    </span>
  )
}
