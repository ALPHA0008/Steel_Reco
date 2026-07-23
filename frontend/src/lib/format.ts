/**
 * One locale, everywhere. This is a reconciliation tool — every number and
 * date must read the same on every screen so a figure can be compared to the
 * source Excel without a mental format-conversion. All grouping is Indian
 * (`en-IN`, lakh/crore), all dates use a single unambiguous DD MMM YYYY form
 * rather than the browser's locale (which varies by machine and produces
 * `7/23/2026` vs `23/07/2026` inconsistencies).
 */

const LOCALE = "en-IN"

/** Coerce the API's string|number numerics to a number. */
function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === "string" ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

/** Indian-grouped number. `digits` fixes both min and max fraction digits. */
export function formatNumber(
  v: string | number | null | undefined,
  digits?: number,
): string {
  const n = toNum(v)
  if (n == null) return "—"
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits ?? 2,
  })
}

/** Whole-number Indian-grouped integer (no fraction). */
export function formatInt(v: string | number | null | undefined): string {
  return formatNumber(v, 0)
}

/** Rupee amount, Indian grouping, no paise by default. */
export function formatMoney(
  v: string | number | null | undefined,
  digits = 0,
): string {
  const n = toNum(v)
  if (n == null) return "—"
  return n.toLocaleString(LOCALE, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: digits,
  })
}

// --- Dates -----------------------------------------------------------------

/** Parse an ISO date (or `YYYY-MM-DD`) safely; returns null on garbage. */
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `30 Sep 2023` — one unambiguous date format across the whole app. */
export function formatDate(iso: string | null | undefined): string {
  const d = parseISO(iso)
  if (!d) return "—"
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" })
}

/** `30 Sep 2023, 4:12 pm` — date + time, no seconds, 12-hour. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parseISO(iso)
  if (!d) return "—"
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** `Sep 23` — compact month label for chart axes (year optional). */
export function formatMonthShort(year: number, month1to12: number, withYear = false): string {
  const d = new Date(year, month1to12 - 1, 1)
  return d.toLocaleDateString(LOCALE, {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  })
}
