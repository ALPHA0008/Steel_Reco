/**
 * Records an end-to-end walkthrough of Digi Reco against a sandbox database:
 * every ledger screen, the exception queue resolved via all three validated
 * paths, the Abstract, and finalizing April 2026.
 *
 * Produces a .webm video of the whole run plus a numbered screenshot per step,
 * so the run can be reviewed either as a recording or step by step.
 *
 * Run against the SANDBOX only (VITE_API_TARGET pointed at the throwaway DB) --
 * it finalizes a month and resolves exceptions, which are real mutations.
 *
 *   node scripts/walkthrough-april.mjs <baseUrl> <outDir> <user> <pass>
 */
import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"

const [BASE = "http://localhost:5174", OUT = "walkthrough", USER = "qs_april", PASS = "walkthrough123"] =
  process.argv.slice(2)

const SHOTS = `${OUT}/screenshots`
mkdirSync(SHOTS, { recursive: true })

const log = []
let step = 0

/** Screenshot + narrate. The caption becomes a line in the written walkthrough,
 *  so the video and the document stay in step with each other. */
async function shot(page, caption) {
  step += 1
  const name = `${String(step).padStart(2, "0")}-${caption.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`
  await page.waitForTimeout(450) // let motion settle so frames aren't mid-animation
  await page.screenshot({ path: `${SHOTS}/${name}` })
  log.push({ step, caption, screenshot: `screenshots/${name}` })
  console.log(`  ${String(step).padStart(2, "0")}. ${caption}`)
}

/** Pause long enough for the recording to read naturally, not just for the DOM. */
const beat = (page, ms = 900) => page.waitForTimeout(ms)

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  reducedMotion: "no-preference",
})
const page = await context.newPage()

const errors = []
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text())
})

try {
  // ---- Sign in -------------------------------------------------------------
  console.log("\nSIGN IN")
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await shot(page, "Login screen")
  await page.getByRole("textbox", { name: "Username" }).fill(USER)
  await page.getByRole("textbox", { name: "Password" }).fill(PASS)
  await beat(page, 400)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(/dashboard/, { timeout: 20000 })
  await page.waitForLoadState("networkidle")
  await shot(page, "Dashboard after sign-in")

  // ---- Every ledger screen -------------------------------------------------
  console.log("\nLEDGERS")
  const LEDGERS = [
    ["/grn", "GRN register"],
    ["/store-issues", "Store issues"],
    ["/purchase-orders", "Purchase orders"],
    ["/invoices", "Supplier invoices"],
    ["/jmr", "JMR actuals"],
    ["/bbs", "BBS plan"],
    ["/physical-counts", "Physical count"],
    ["/scrap", "Scrap sales"],
    ["/transfers", "Inter-site transfers"],
    ["/myhome-stock", "Stock at My Home"],
    ["/data-health", "Data health"],
  ]
  for (const [path, label] of LEDGERS) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" })
    await beat(page, 700)
    await shot(page, label)
  }

  // ---- Exceptions: all three validated paths -------------------------------
  console.log("\nEXCEPTIONS")
  await page.goto(`${BASE}/exceptions`, { waitUntil: "networkidle" })
  await beat(page)
  await shot(page, "Exception queue before triage")

  // (a) A "corrected" claim with nothing actually fixed must be REFUSED.
  await page.getByRole("button", { name: "Corrected" }).first().click()
  await beat(page)
  await page.locator("textarea").fill("I already sorted this out")
  await page.locator('input[placeholder="Full name"]').fill("Ramesh Kumar")
  await shot(page, "Claiming corrected without fixing the data")
  await page.getByRole("button", { name: "Re-check and resolve" }).click()
  await page.waitForTimeout(1600)
  await shot(page, "Refused - the rule was re-run and still fails")
  await page.getByRole("button", { name: "Cancel" }).click()
  await beat(page)

  // (b) Approve as-is: a conscious override, signed.
  await page.getByRole("button", { name: "Approve" }).first().click()
  await beat(page)
  await page.locator("textarea").fill("Opening stock predates the system; checked against the manual register")
  await page.locator('input[placeholder="Full name"]').fill("Suresh Babu")
  await shot(page, "Approving as-is with a signed reason")
  await page.getByRole("button", { name: "Approve with reason" }).click()
  await page.waitForTimeout(1600)
  await shot(page, "Approved and recorded")

  // (c) Follow-up: a dated commitment that does NOT resolve anything.
  await page.getByRole("button", { name: "Follow up" }).first().click()
  await beat(page)
  const due = page.locator('input[type="date"]')
  await due.fill(await due.getAttribute("max"))
  await page.locator("textarea").fill("Store to recount the 12mm bundles on level 4")
  await page.locator('input[placeholder="Full name"]').fill("Priya Nair")
  await shot(page, "Committing to a dated follow-up")
  await page.getByRole("button", { name: "Set follow-up" }).click()
  await page.waitForTimeout(1600)
  await shot(page, "Parked as pending - still blocks the close")

  // ---- Finalize is blocked while anything is unanswered --------------------
  console.log("\nFINALIZE GATE")
  await page.goto(`${BASE}/abstract?year=2026&month=4`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2500) // the Abstract computes server-side
  await shot(page, "April Abstract - reconciliation bands")
  await page.mouse.wheel(0, 900)
  await beat(page)
  await shot(page, "Abstract - issued, stock and reconciliation sections")
  await page.mouse.wheel(0, 900)
  await beat(page)
  await shot(page, "Abstract - lower sections")
  await page.mouse.wheel(0, -1800)
  await beat(page)

  const finalizeBtn = page.getByRole("button", { name: /Finalize/i }).first()
  if (await finalizeBtn.isVisible().catch(() => false)) {
    await finalizeBtn.click()
    await beat(page)
    await page.getByRole("button", { name: /Finalize month/i }).click()
    await page.waitForTimeout(2000)
    await shot(page, "Finalize refused - exceptions still unanswered")
  }

  // ---- Answer everything, then close the month ----------------------------
  console.log("\nCLEARING THE QUEUE")
  await page.goto(`${BASE}/exceptions`, { waitUntil: "networkidle" })
  await beat(page)
  // Approve whatever remains (including the pending follow-up, which must
  // eventually become corrected or approved).
  for (let i = 0; i < 8; i += 1) {
    const btn = page.getByRole("button", { name: "Approve" }).first()
    if (!(await btn.isVisible().catch(() => false))) break
    await btn.click()
    await beat(page, 500)
    await page.locator("textarea").fill("Reviewed against site records and accepted for the April close")
    await page.locator('input[placeholder="Full name"]').fill("Suresh Babu")
    await page.getByRole("button", { name: "Approve with reason" }).click()
    await page.waitForTimeout(1400)
  }
  await shot(page, "Open queue cleared")
  await page.getByRole("tab", { name: "Resolved" }).click()
  await beat(page)
  await shot(page, "Resolved tab - each decision signed by a person")

  console.log("\nFINALIZE APRIL")
  await page.goto(`${BASE}/abstract?year=2026&month=4`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2500)
  const fin = page.getByRole("button", { name: /Finalize/i }).first()
  if (await fin.isVisible().catch(() => false)) {
    await fin.click()
    await beat(page)
    await shot(page, "Confirming the April finalize")
    await page.getByRole("button", { name: /Finalize month/i }).click()
    await page.waitForTimeout(3000)
    await shot(page, "April 2026 finalized and locked")
  }

  // ---- The lock is real: an April entry is refused -------------------------
  await page.goto(`${BASE}/grn/new`, { waitUntil: "networkidle" }).catch(() => {})
  await beat(page)
  await shot(page, "New GRN screen after the April lock")

  // ---- Quick Draft: enter known figures and have them checked --------------
  await page.goto(`${BASE}/abstract/draft`, { waitUntil: "networkidle" }).catch(() => {})
  await page.waitForTimeout(1200)
  await shot(page, "Quick Draft - enter known figures for checking")

  // ---- Dark mode, and mobile ---------------------------------------------
  console.log("\nTHEME + MOBILE")
  await page.evaluate(() => localStorage.setItem("theme", "dark"))
  await page.goto(`${BASE}/abstract?year=2026&month=4`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2500)
  await shot(page, "Abstract in dark mode")
  await page.goto(`${BASE}/exceptions`, { waitUntil: "networkidle" })
  await beat(page)
  await shot(page, "Exceptions in dark mode")

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/exceptions`, { waitUntil: "networkidle" })
  await beat(page)
  await shot(page, "Exceptions on mobile")
  await page.goto(`${BASE}/abstract?year=2026&month=4`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2500)
  await shot(page, "Abstract on mobile")
} catch (err) {
  console.error("\nWALKTHROUGH FAILED:", err.message)
  await page.screenshot({ path: `${SHOTS}/99-failure.png` }).catch(() => {})
  log.push({ step: 99, caption: `FAILED: ${err.message}`, screenshot: "screenshots/99-failure.png" })
  process.exitCode = 1
} finally {
  const video = page.video()
  await context.close() // flushes the video to disk
  const videoPath = video ? await video.path() : null
  await browser.close()
  writeFileSync(
    `${OUT}/steps.json`,
    JSON.stringify({ steps: log, consoleErrors: errors, video: videoPath }, null, 2),
  )
  console.log(`\nvideo: ${videoPath}`)
  console.log(`console errors: ${errors.length}`)
  errors.slice(0, 10).forEach((e) => console.log(`  - ${e.slice(0, 160)}`))
}
