# Steel Reconciliation Platform — Design System

> **Role of this file:** the *design-system spec* — concrete component specs, states, responsive rules, and the token→MUI mapping. Values live in [`design-tokens.json`](./design-tokens.json) (single source of truth). Rationale, brand foundation, voice, and the anti-slop philosophy live in [`brandguidelines.md`](./brandguidelines.md). Build order lives in `../IMPLEMENTATION_PLAN.md` §7/§9.
>
> **Stack decision (locked):** React + TypeScript + Vite + **MUI v6 + MUI X DataGrid**, themed entirely from `design-tokens.json` (→ `theme.ts` via `createTheme` + `tokens.css` custom properties). We do **not** add Tailwind, shadcn, or a second styling engine. Component libraries surveyed for this system (21st.dev, react-bits, Google Stitch) inform *visual patterns only*; their code is Tailwind-ecosystem and is never imported. react-bits (an animation library) is deliberately unused in the core tool.
>
> **Design ethos — "Apple philosophy, our density":** extreme restraint, typographic precision, content-over-chrome, soft materials (cards float on a soft shadow, not a hard border), and crafted micro-motion — Apple's *soul* — applied to a **dense, scannable cockpit**. We take Apple's craft, not its airy consumer spacing or translucency. Air lives in the chrome (page/section padding); density stays in the data (36px grid rows).

---

## 1. Design Direction

**Purpose:** Daily steel inventory ledger entry + monthly Abstract reconciliation for Quantity Surveyors at My Home Constructions — and, per the process reframing, a tool that *enforces a unified process* and *validates every number against ground truth*.

**Audience:** QS and store personnel who spend hours in Excel. The interface must feel familiar, fast, and trustworthy — not unfamiliar. Adoption depends on it looking like a sharper version of the ledger they already trust, not a foreign SaaS app.

**Tone:** Industrial, utilitarian, dense, scannable. A tool for repeated daily use, not a marketing site. Every pixel serves the workflow. Quiet by default; loud only when a rule is breached.

**Memorable detail:** the Abstract grid is a *live digital twin* of the QS's Excel sheet (rows A–N × dia columns 8/10/12/16/20/25/32 + Total). Every computed cell is **inspectable** — hover shows the formula, click drills to the source ledger rows. Familiarity drives adoption; traceability earns trust.

**Constraints:** MUI DataGrid (pinned columns, cell styling, CSV export); React + Vite; construction-site laptops at **1366×768**; must render legibly under bright site lighting (hence higher-contrast text, no low-contrast gray-on-gray).

---

## 2. Foundations

All foundational values are tokens — never hard-code. Reference `design-tokens.json`:

- **Color** — `color.light.*` / `color.dark.*` (both wired; see §9)
- **Typography** — `typography.scale.*`, Inter, `numericVariant` (tabular-nums) on all numbers
- **Spacing** — `space.*` (4px base: 2/4/8/12/16/24/32/48/64)
- **Radius** — `radius.*` (sm 4 / md 6 / lg 8 / cell 0 / pill)
- **Sizing** — `sizing.*` (sidebar 240/64, header 56, control 36, dense row 36)
- **Elevation** — `elevation.*` (flat by default; shadows only for popovers/dialogs)
- **Motion** — `motion.*` (transform/opacity only; reduced-motion aware)
- **Focus** — `focusRing.*` (2px, 2px offset, steel)

---

## 3. Palette & usage rules

Three color families, each with one job. This separation is what keeps the UI from collapsing into one-note SaaS blue or drowning in decorative color.

| Family | Token | Job — and *only* this job |
|---|---|---|
| **Industrial Steel** (primary) | `primary.*` | The workhorse. Links, selected rows, active nav, checkboxes/switches, focus ring, secondary (outlined) buttons. Calm slate-blue inspired by structural steel. |
| **Warm Copper** (accent) | `accent.*` | The **one** primary CTA per view (Save, Finalize). Construction-site copper. **Never** for status, never two copper buttons on one screen. |
| **Semantics** | `success` / `warning` / `danger` | **Status only, never decoration.** Green = within cap / stock OK. Amber = near threshold / advisory exception. Red = over-cap / blocking violation / destructive. |
| **Neutrals** | `surface.*` `border.*` `text.*` | Warm paper background (`surface.app`), white cards, hairline borders. Warm neutrals harmonize with copper; the cool steel-blue is the deliberate counterpoint. |

Usage rules (enforced in review):
- Wastage % row: `success` when ≤ (cap − warn band), `warning` inside the band, `danger` when > 3% cap.
- Advisory exception → `warning` tint; blocking violation → `danger` tint + top-of-form banner.
- A finalized month is tinted with `primary.subtle` (locked, authoritative) — not gray (which reads as disabled).

---

## 4. Typography

- **Family:** Inter (UI + data). Mono (`fontFamilyMono`) only for IDs/hashes (e.g. snapshot `source_txn_hash`).
- **Scale:** `display 24 · title 20 · h2 16 · h3 14 · body 14 · label 13 · caption 12`. Tight scale for density — no oversized hero text.
- **Table headers:** 12px uppercase, 600, `+0.04em` tracking (saves vertical space, aids scanning).
- **Numbers everywhere:** `font-variant-numeric: tabular-nums lining-nums` on every figure (grid cells, KPIs, form numeric inputs) so digits align in columns and don't jitter on update.
- **Wrapping:** `text-wrap: balance` on headings; `text-wrap: pretty` on descriptions (per ECC `make-interfaces-feel-better`).

---

## 5. Spacing, radius, elevation

- **Spacing:** 4px base; default gaps tight (8/12/16). Section gaps 24; page padding 24.
- **Concentric radius** (ECC rule): `outer = inner + padding`. A card at `radius.lg` (8) with 16 padding → inner controls at `radius.sm/md`. Table cells are `radius.cell` (0) — they read as a ledger, not pills.
- **Elevation:** `flat` (borders do separation) for cards, nav, table. Shadows reserved for `popover` (menus, tooltips) and `dialog` (modals). No decorative or hover-lift shadows.

---

## 6. Layout & responsive

- **App shell:** fixed left **Sidebar** (240px expanded / 64px icon-only), top **Header** (56px), scrollable content region (max-width 1440, centered).
- **Primary target 1366×768:** the Abstract (8 dia cols + Total = 9 numeric columns + pinned label) must be fully usable here. The **DataGrid owns horizontal scroll**; the page body must never scroll horizontally. Pinned first (section label) + last (Total) columns stay visible during horizontal scroll.
- **Breakpoints** (`breakpoints.*`, MUI defaults): xs 0 / sm 600 / md 960 / lg 1280 / xl 1536. Below md the sidebar collapses to a temporary drawer; forms go full-width.
- **Stable dimensions** (ECC rule): toolbars, grid headers, KPI tiles, and buttons must not reflow when labels, hover, or async content appear. Reserve space for the loading and error states.

---

## 7. Motion

Purposeful only — motion clarifies state, never decorates (a daily tool must not feel busy).
- **Tokens:** `motion.duration.fast|base` with `easing.standard`. Enter = opacity + `translateY(4px)`; press = `scale(0.97)`; row/selection changes cross-fade `fast`.
- **Hard rules:** animate `transform`/`opacity` only; never `transition: all`; honor `prefers-reduced-motion` (fallback 0ms, opacity-only fades ≤120ms). No scroll animations, no entrance choreography on the grid.

---

## 8. Accessibility (WCAG 2.2 AA — non-negotiable)

Applying ECC `accessibility` + `a11y-architect`:
- **Contrast:** text ≥ 4.5:1 (large ≥ 3:1); UI/graphics ≥ 3:1. All token pairs verified in `_meta` (steel 7.8:1, copper 5.2:1, danger 6.5:1 on their backgrounds).
- **Targets:** interactive controls ≥ 24×24 CSS px (SC 2.5.8); dense grid action icons get a ≥40×40 hit area via padding/pseudo-element even at 36px row height.
- **Focus:** always-visible 2px steel focus ring, 2px offset (SC 2.4.11) — never `outline:none` without a replacement.
- **Forms:** every input has a programmatic `<label htmlFor>`; errors use `aria-describedby` + `role="alert"`; `aria-required` on required fields.
- **Redundant entry (SC 3.3.7):** never ask for data already known — auto-fill net weight from gross−tare, pre-fill project/period from context.
- **Keyboard:** full keyboard path for entry (the QS may not reach for the mouse mid-batch); modals trap focus + close on Esc (SC 2.1.2); grid is arrow-key navigable.
- **Not color alone:** over-cap wastage shows red **and** an icon/label; advisory vs blocking differ by icon + text, not just hue.

---

## 9. Component specs

Each component: purpose, key tokens, and its **state matrix**. States every interactive component must define: **default · hover · focus-visible · active/pressed · disabled · loading · error/violation · read-only (finalized)**.

### 9.1 App Shell
`Sidebar` (240/64) + `Header` (56) + content. Sidebar: nav items with lucide icon + label, active item uses `primary.subtle` bg + `primary.default` text + 2px left rail; collapse to icon-only with tooltips. Header: project switcher (only projects the QS is assigned), month picker, and — on the Abstract — the copper **Finalize** CTA. Skip-to-content link first in DOM.

### 9.2 Cards / Panels
`surface.default` bg, `border.hairline` 1px, `radius.lg`, `elevation.flat`, 16 padding. **No card inside a card** (ECC anti-pattern). KPI stat tile = label (caption) + value (`display`, tabular) + delta chip (semantic) — sparkline **only** on the Wastage tile.

### 9.3 DataGrid (MUI X) — the workhorse
Dense 36px rows, 40px header (12px uppercase). Numeric columns right-aligned + tabular-nums. Alternating `dataRow.stripe`. Row hover `dataRow.hover`; selected `dataRow.selected`. Sorting, server-side pagination, CSV export, empty-state, loading skeleton. Pinned columns where relevant.

### 9.4 AbstractGrid (the digital twin)
Read-only (no cell is ever editable — the invariant "no summary is typed"). Rows A–N with human labels; dia columns + Total. First column + Total pinned. Numbers `num`/`numStrong`. **Every computed cell (C,G,H,K,L,M) is inspectable:** hover → tooltip with the formula (e.g. "D = Σ issue.out − Σ issue.in"); click → drawer listing the exact source ledger rows. Wastage % row conditionally `danger` when > cap. Finalized month: whole grid tinted `primary.subtle`, a "Finalized · locked" pill in the toolbar.

### 9.5 Forms & Fields
Single-column, max 640px, labels **above** inputs, 24px vertical rhythm. `Field` wrapper = label + optional description + control + inline error (red, below, `role="alert"`). Read-only/computed fields (e.g. net weight) subtly shaded (`surface.sunken`) and non-editable. Two-tier error model:
- **Field errors** (Pydantic 422 → per field) inline under the field.
- **Blocking rule violations** (422 from a rule, e.g. issue > stock) → a `danger` **banner at the top of the form** naming the exact constraint (PRD story 17).
- **Advisory** (e.g. GRN with no linked PO) → dismissible `warning` banner: "saved but flagged for reconciliation."

### 9.6 Buttons
36px height, no ripple, no uppercase, no elevation.
- **Primary CTA:** copper `accent` fill, white text — one per view.
- **Secondary:** outlined steel.
- **Tertiary/ghost:** text-only steel.
- **Destructive:** outlined `danger` (confirm via dialog).
Full-width on mobile; auto width on desktop.

### 9.7 Inputs / Selects / Segmented controls
36px height, `border.strong` 1px → `primary` on focus + focus ring. Segmented control for small enums (Receipt Type). Searchable dropdowns for masters (PO, contractor, dia). Date picker for `effective_date`.

### 9.8 Feedback
Toasts (success/error) bottom, auto-dismiss, `popover` elevation. Confirm dialogs name the exact object/period (e.g. "Finalize April 2026?"). Reopen dialog requires a non-empty reason before submit is enabled (PRD story 20).

### 9.9 Empty & loading
Every list: skeleton → populated → explicit `EmptyState` (icon + one line + primary action) when zero rows — never a blank grid. Every async region reserves its final dimensions to avoid layout shift.

---

## 10. State matrix (reference)

| State | Visual treatment |
|---|---|
| Default | Neutral surface + hairline border |
| Hover | `dataRow.hover` / button `*.hover`; cursor pointer; no lift |
| Focus-visible | 2px steel ring, 2px offset |
| Active/pressed | `*.active`; `scale(0.97)` on buttons |
| Disabled | `text.disabled`, `surface.sunken`, no pointer; never the only signal |
| Loading | Skeleton (lists/cards) or inline spinner (buttons) + disabled submit |
| Advisory | `warning` icon + tint + text |
| Blocking / over-cap | `danger` icon + tint + banner |
| Read-only / finalized | `primary.subtle` tint + lock pill; inputs non-editable |
| Empty | `EmptyState` (icon + line + action) |

---

## 11. Anti-slop guardrails (ECC `design-system` Mode 3 — reject on sight)

- ❌ Gradients on anything · ❌ glassmorphism · ❌ purple/violet defaults · ❌ decorative blobs
- ❌ Oversized centered hero copy · ❌ stock/atmospheric imagery · ❌ card-inside-a-card
- ❌ Gratuitous scroll/entrance animation · ❌ `transition: all` · ❌ a chart in every KPI tile
- ❌ One-hue palette · ❌ color as the only status signal · ❌ low-contrast gray-on-gray
- ✅ Dense, quiet, scannable · ✅ borders over shadows · ✅ tabular numerals · ✅ every number traceable

---

## 12. MUI implementation notes

`theme.ts` builds `createTheme` from `design-tokens.json` (see `muiMapping` block):
- `palette.primary` = steel; `palette.secondary` = copper (the CTA color — used only via `<Button color="secondary" variant="contained">`); `success/warning/error` = semantics; `background.default/paper`, `text.*`, `divider` from tokens.
- `shape.borderRadius = 6`; `spacing` factor = 4; `typography.fontFamily` = Inter.
- Component defaults: `MuiButton` `disableElevation` + `disableRipple` + `textTransform:none`; `MuiPaper` flat; `MuiDataGrid` `rowHeight:36`, `columnHeaderHeight:40`, tabular-nums on numeric cells, custom stripe/hover/selected from `dataRow.*`.
- `tokens.css` also emits the same values as CSS custom properties (`--color-primary`, `--space-4`, …) for any non-MUI surface and for the light/dark switch via `:root[data-theme]`.
- **Dark mode:** both palettes are wired; default light, toggle persists to localStorage, respects `prefers-color-scheme` on first load.

---

## 13. How this maps to the build

1. `tokens.css` + `theme.ts` (from this file) — foundation.
2. App shell (Sidebar/Header) + auth landing.
3. Shared components: `DataTable`, `Field`/`EntryForm`, `Card`/KPI tile, `Banner`, `EmptyState`, `ConfirmDialog`.
4. Vertical slice: GRN entry (proves the Field/validation/banner system) → remaining transaction UIs.
5. `AbstractGrid` + `AbstractPage` (the digital twin) → Dashboard.
6. Month-close UI + wastage trend.

Grade the result against the ECC `gan-design` rubric (≥7.5) and the §11 anti-slop checklist before calling any screen done.
