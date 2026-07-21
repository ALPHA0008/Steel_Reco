/**
 * Site hero images. Vite eager-globs everything under assets/sites, so dropping
 * a file there makes it available with no code change. Map a site NAME to its
 * file by a slug; unmatched sites fall back to `null` (drawer shows a graceful
 * gradient placeholder).
 *
 * To add/replace an image, drop it at:  src/assets/sites/<slug>.<ext>
 * Recognised slugs below (add more as sites are onboarded).
 */
const modules = import.meta.glob("@/assets/sites/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>

// filename (without dir/ext) -> url
const byBasename: Record<string, string> = {}
for (const [path, url] of Object.entries(modules)) {
  const base = path.split("/").pop()?.replace(/\.(png|jpg|jpeg|webp)$/i, "") ?? ""
  byBasename[base.toLowerCase()] = url
}

// Site name -> candidate slugs (first match wins).
const NAME_TO_SLUGS: Record<string, string[]> = {
  "My Home APAS": ["apas", "my-home-apas"],
  "99": ["my-home-99", "99"],
  "Grava": ["grava", "grava-residences"],
  "Sayuk": ["sayuk", "my-home-sayuk"],
  "Nishada": ["nishada", "my-home-nishada"],
}

export function siteImage(name: string): string | null {
  for (const slug of NAME_TO_SLUGS[name] ?? [name.toLowerCase()]) {
    if (byBasename[slug]) return byBasename[slug]
  }
  return null
}
