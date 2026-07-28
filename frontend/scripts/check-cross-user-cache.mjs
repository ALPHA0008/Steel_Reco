/**
 * Regression check: one user's cached data must never be shown to the next.
 *
 * React Query keys here are per-resource, not per-user (`["project-me"]`,
 * `["dashboard-summary"]`, ...), so the cache is shared across whoever is
 * signed in. Signing out only cleared the token and user state, leaving every
 * cached response in memory -- and with a 5-minute staleTime the next user was
 * served the previous one's project as *fresh*, so it was never even refetched.
 * The reported symptom was a dashboard headed "My Home APAS" above "signed in
 * as Test Project QS".
 *
 * Two details make or break this check:
 *   - It must NOT reload the page between sessions. A full load wipes the JS
 *     heap and with it the cache being tested; real users get a client-side
 *     redirect from RequireAuth.
 *   - It must wait for the header's own subtitle before reading, otherwise it
 *     samples the loading state instead of the rendered (possibly stale) value.
 *
 * Usage:  node scripts/check-cross-user-cache.mjs [baseUrl]
 * Exits non-zero if any user sees another's project.
 */
import { chromium } from "playwright"

const BASE = process.argv[2] || "http://localhost:5173"
const PASS = process.env.QS_PASSWORD || "dev-password-123"

// username -> the project that user is actually assigned to.
// (qs_apas's full_name is "Test QS" in the seed data -- confusing, but correct.)
const EXPECT = {
  qs_apas: "My Home APAS",
  qs_testproject: "Test Project",
  qs_grava: "Grava",
}

// Alternates deliberately, and revisits, so a stale entry from any earlier
// session would surface.
const SEQUENCE = ["qs_apas", "qs_testproject", "qs_apas", "qs_grava", "qs_testproject"]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

async function signIn(username, { fresh = false } = {}) {
  if (fresh) await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  await page.getByRole("textbox", { name: "Username" }).fill(username)
  // Submit with Enter: the button re-renders on state change and can detach
  // mid-click, which is a harness race rather than a product bug.
  await page.getByRole("textbox", { name: "Password" }).fill(PASS)
  await page.getByRole("textbox", { name: "Password" }).press("Enter")
  await page.waitForURL(/dashboard/, { timeout: 20000 })
}

async function identity() {
  await page
    .locator("p", { hasText: "signed in as" })
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {})
  return page.evaluate(() => {
    const subEl = [...document.querySelectorAll("p")].find((p) =>
      /signed in as/.test(p.textContent || ""),
    )
    const sub = subEl?.textContent?.trim() ?? ""
    return {
      project: subEl?.previousElementSibling?.textContent?.trim() ?? "",
      who: (sub.split("signed in as")[1] ?? "").trim(),
    }
  })
}

async function signOut() {
  const trigger = page.locator("[data-slot='dropdown-menu-trigger']").last()
  if (await trigger.count()) {
    await trigger.click({ force: true })
    await page.waitForTimeout(350)
    const item = page.getByRole("menuitem", { name: /sign out/i })
    if (await item.count()) await item.click()
  }
  // No page.goto here, on purpose -- see the note at the top of this file.
  await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
}

console.log("\nCROSS-USER CACHE CHECK — project heading vs signed-in user")
let failures = 0
let first = true
for (const username of SEQUENCE) {
  await signIn(username, { fresh: first })
  first = false
  const got = await identity()
  const want = EXPECT[username]
  const wrong = got.project !== want
  if (wrong) failures += 1
  console.log(
    `  ${username.padEnd(15)} "${got.project}"  ·  signed in as "${got.who}"` +
      (wrong ? `   <-- WRONG, expected "${want}"` : ""),
  )
  await signOut()
}

console.log(
  failures
    ? `\n  FAIL — ${failures} stale heading(s); the query cache survived a sign-out`
    : "\n  PASS — no cross-user bleed",
)
await browser.close()
process.exitCode = failures ? 1 : 0
