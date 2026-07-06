# Steel Reconciliation Platform — Brand & Product Design Guidelines

> **Role of this file:** the north-star for *how the product looks, sounds, and behaves* — brand foundation, voice, visual language, app flow, states, and do/don'ts. It is rationale-rich and human-facing.
> - Concrete component specs & the MUI mapping → [`design.md`](./design.md)
> - Machine values (the single source of truth) → [`design-tokens.json`](./design-tokens.json)
> - What/why of the reconciliation logic → `../PROCESS_AND_VALIDATION.md`
>
> Working product name: **Steel Reconciliation Platform** (internal). A shorter codename can be adopted later; nothing in this system depends on it.

---

## 1. Brand foundation

### 1.1 Purpose (the why)
Steel is the single largest material cost on a project, and today its reconciliation lives in fragile, inconsistent Excel sheets where a formula quietly hides the losses. **This product exists to make steel loss visible, traceable, and preventable** — by enforcing one honest process across every site and validating every number against the few documents we can actually trust. It is not a dashboard that decorates data; it is an instrument that tells the truth about it.

### 1.2 Personality
If the product were a person on site: a **senior quantity surveyor** — precise, unflashy, quietly authoritative, trusted because they show their working. Adjectives: **exact, grounded, industrial, honest, calm.** Never: playful, trendy, decorative, loud-for-its-own-sake.

### 1.3 Design principles (decide arguments with these)
1. **Truth over polish.** Every number is traceable to a source row. If we can't show where a figure came from, we don't show it as fact.
2. **Familiar, then better.** It must read like the ledger the QS already trusts (Abstract A–N × dia columns), then quietly out-perform it. Familiarity drives adoption.
3. **Dense, quiet, scannable.** A tool for hours of daily use. Information density is a feature; whitespace is earned, not sprayed. Loud only when a rule breaks.
4. **The data is the hero.** No chrome competes with the numbers. No hero imagery, no marketing composition.
5. **Guardrails, not gates (at first).** Catch mistakes visibly (advisory) before blocking them; the process earns the right to enforce.
6. **Accessible and legible on a bright site.** High-contrast, keyboard-complete, works on a 1366×768 laptop in daylight.

---

## 2. Voice & tone

**Voice (constant):** plain, precise, respectful of the reader's expertise. Short sentences. Domain-correct terms (GRN, BBS, JMR, dia, wastage) used exactly. No hype, no cutesy filler, no exclamation marks, no "Oops!". Write the way a careful QS writes a note to a colleague.

**Tone (varies by moment):**

| Moment | Tone | Example microcopy |
|---|---|---|
| Empty list | Matter-of-fact, actionable | "No GRNs recorded for April 2026 yet. **Record the first receipt** to begin." |
| Field error | Specific, corrective, no blame | "Enter the net weight in kg (numbers only)." |
| Advisory flag | Neutral, informative | "Saved. This GRN has no linked Purchase Order — flagged for reconciliation." |
| Blocking violation | Direct, names the rule | "Cannot issue 4,200 kg of 16 mm — only 3,850 kg is in store. Reduce the quantity or record a receipt first." |
| Over-cap wastage | Factual, not alarmist | "Wastage 4.97% exceeds the 3% contractual cap." |
| Destructive confirm | Clear about consequence | "Reopen April 2026? The finalized figures will unlock and a new snapshot will be created on re-finalize." |
| Success | Brief, then get out of the way | "GRN saved." |

**Never write:** "Oops! Something went wrong" · "Awesome!" · vague "Invalid input" · marketing adjectives ("powerful", "seamless") inside the UI · error text that blames the user.

---

## 3. Logo & wordmark

No logo exists yet. Until one is commissioned, use a **typographic wordmark**: "Steel Reconciliation" set in Inter SemiBold, `text.primary`, with a single 3px **copper** square or short bar as the only mark (a nod to a steel bar's cross-section / the accent color). Guidance:
- Clear space = the cap-height on all sides. Minimum wordmark height 20px.
- Mono-color only: `text.primary` on light, `text.primary`(dark) on dark; the copper mark is the sole color accent.
- Never stretch, rotate, add gradients/shadows, or place on a busy background. In the collapsed sidebar (64px), show only the copper mark.

---

## 4. Color

The palette is deliberately **multi-dimensional** (warm neutrals + cool steel + warm copper + status) to avoid the one-hue SaaS look. Full values and contrast proofs in `design-tokens.json`. Meanings and rules:

| Family | Meaning | Where it may appear | Where it must NOT |
|---|---|---|---|
| **Industrial Steel** (slate-blue) | Structure, trust, the interactive workhorse | Links, active nav, selected rows, checkboxes, focus ring, outlined buttons, finalized-month tint | As a "status" color |
| **Warm Copper** (accent) | The single most important action | One primary CTA per view (Save/Finalize) | Status, decoration, >1 per screen |
| **Green / Amber / Red** (semantic) | Status only | Wastage bands, advisory/blocking flags, deltas, validation | Decoration, backgrounds-for-looks, branding |
| **Warm paper neutrals** | Calm, ledger-like ground | App bg, cards, borders, text | Never pure clinical white app bg; never cool battleship gray |

**Rules:** semantic colors are reserved strictly for status (a red that sometimes means "brand" and sometimes "danger" destroys the signal). Copper is precious — one per view. Status is never conveyed by color alone (always icon + text too).

---

## 5. Typography

- **Typeface:** Inter throughout (UI + data); mono only for machine IDs/hashes.
- **Hierarchy:** display 24 → title 20 → h2 16 → h3 14 → body 14 → label 13 → caption 12. Tight, dense — no oversized hero text (this is a tool, not a landing page).
- **Numbers are first-class:** every figure uses tabular lining numerals so columns align and values don't shift width when they update. This is the typographic backbone of a reconciliation tool.
- **Table headers:** 12px uppercase, semibold, slight tracking.
- Headings use `text-wrap: balance`; descriptions `text-wrap: pretty`.

---

## 6. Spacing & layout

- **4px base scale** (2/4/8/12/16/24/32/48/64). Tight by default; 24px between form fields and page sections.
- **Concentric radius:** outer = inner + padding. Cards `radius.lg` (8); controls `radius.md` (6); table cells `radius 0` (they are a ledger).
- **Shell:** 240/64px sidebar · 56px header · content max 1440, centered. **Designed for 1366×768** — the full Abstract fits; the grid (not the page) scrolls horizontally.
- **Elevation is flat.** Borders separate; shadows appear only on popovers and dialogs. No hover-lift, no decorative depth.

---

## 7. Iconography

- **Library:** lucide (single, consistent set). Line icons, ~1.5px stroke, 18–20px in nav and buttons.
- **Purpose only:** icons label familiar actions (add, export, filter, lock) and reinforce status (⚠ advisory, ⛔ blocking, ✓ ok) — never decorative filler.
- **Pair with text** wherever an icon carries meaning; never rely on an icon alone for a critical action or a status.

---

## 8. Data visualization

The Abstract grid is the primary "visualization" — a truthful table beats a pretty chart. Charts are rare and earn their place (apply ECC `dataviz`):
- **Only where a trend needs to be *felt*:** the wastage % over months (line, with the 3% cap drawn as a reference line), and possibly stock-vs-theoretical. Nothing else gets a chart by default.
- **One system:** semantic colors keep their meaning in charts (over-cap = danger red). No rainbow categorical palettes, no 3D, no gratuitous animation, no chart-in-every-KPI-tile.
- **Always labelled and readable:** direct labels over legends where possible; tabular numerals in tooltips; accessible color + shape, not color alone.

---

## 9. Motion

Motion clarifies state; it never entertains. Enter = gentle fade + 4px rise; press = subtle scale; selection = quick cross-fade. Transform/opacity only, `motion.duration.fast|base`, and fully disabled under `prefers-reduced-motion`. No scroll effects, no entrance choreography, nothing that makes a daily tool feel busy or slow.

---

## 10. App flow (user journey)

```
Login ──▶ Land on assigned project's Dashboard (QS sees only their project)
  │
  ├─▶ Dashboard: KPI tiles (Net Received · Consumption · Physical Stock · Wastage%),
  │     wastage trend, recent activity, open exceptions
  │
  ├─▶ Transaction entry (GRN · Store Issue · Transfer · BBS · JMR · Physical Count · Scrap
  │     · + upstream: PO / Invoice / Weighbridge / QC)
  │        └─ Form ▶ live validation ▶ [advisory banner? blocking banner?] ▶ Save ▶ toast ▶ list
  │
  ├─▶ Abstract (the digital twin): live A–N × dia grid; hover a computed cell ▶ formula;
  │     click ▶ drill to source ledger rows
  │
  └─▶ Month close: Finalize (confirm dialog names the period) ▶ immutable snapshot ▶ month locked
          └─ Reopen (requires reason) ▶ edits ▶ re-finalize ▶ new snapshot, history retained
```

Principles across the flow: the QS never types a summary number; every stage references the prior one (an issue draws from real stock, a GRN can cite its PO); a finalized month is visibly locked, not editable-looking-but-erroring.

---

## 11. Component design language & states

Components are quiet containers for data. Shared rules:
- **Cards** hold one idea; never a card inside a card.
- **Tables** are the default display; dense 36px rows, striped, right-aligned tabular numbers, pinned key columns.
- **Forms** are single-column, labels above, 24px rhythm, inline errors + top banner for rule violations.
- **Buttons**: one copper CTA per view; everything else steel-outlined or ghost.

Every interactive component defines all of: **default · hover · focus-visible · active · disabled · loading · advisory · blocking · read-only(finalized) · empty**. (Full matrix in `design.md` §10.) A screen isn't done until its empty, loading, and error states are designed — not just the happy path.

---

## 12. Accessibility commitments (WCAG 2.2 AA)

- Text ≥ 4.5:1, UI ≥ 3:1 (all token pairs proven in `design-tokens.json`).
- Visible 2px focus everywhere; full keyboard operation for data entry; modals trap focus and close on Esc.
- Every field labelled; errors announced (`role="alert"`); required fields marked programmatically.
- Never ask for data we already have (auto-derive net weight; pre-fill period/project).
- Status conveyed by icon + text, not color alone. Targets ≥ 24px (≥40px hit area in dense grids).
- Respects reduced-motion and dark mode.

---

## 13. Do / Don't (anti-slop, from ECC `design-system` Mode 3)

**Do:** dense and quiet · borders over shadows · tabular numerals · one copper CTA · status color = meaning · every number traceable · empty/loading/error states designed · high contrast for site lighting.

**Don't:** gradients · glassmorphism · purple/violet defaults · decorative blobs · oversized hero copy · stock imagery · card-in-card · scroll/entrance animations · `transition: all` · a chart in every tile · one-hue palettes · color-only status · low-contrast gray-on-gray · marketing adjectives in the UI.

---

## 14. Governance

- **`design-tokens.json` is law.** Components reference tokens; no hard-coded hex/px in component files.
- Changes to color/type/space happen in the token file first, then ripple to `theme.ts` + `tokens.css`.
- New screens are reviewed against the §13 don'ts and graded with the ECC `gan-design` rubric (pass ≥ 7.5) before merge.
- This trio stays in sync: brand rationale here → concrete specs in `design.md` → values in `design-tokens.json`.
