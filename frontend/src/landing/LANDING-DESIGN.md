---
version: alpha
name: steel-recon-landing
description: A clean, white-canvas landing page for Steel Recon (My Home Group). The system anchors on a near-white paper surface with a single confident red brand accent, ink-black text, and a steel-blue secondary accent (a literal nod to the product's domain). This is an internal onboarding page, not a sales funnel — no pricing, no free-trial language, no fabricated metrics. Type runs Inter throughout (display and body) rather than a serif pairing — reasoning below.

colors:
  brand: "#d70028"
  brand-hover: "#b2001f"
  brand-subtle: "#fff0ef"
  brand-border: "#ffc7c4"
  ink: "#232425"
  ink-soft: "#5e5e5f"
  muted: "#6b6a6b"
  muted-soft: "#a1a0a1"
  hairline: "#e7e5e6"
  hairline-strong: "#c8c6c7"
  canvas: "#ffffff"
  surface-soft: "#f8f6f7"
  surface-card: "#efedee"
  steel: "#2a5a85"
  steel-subtle: "#eef4ff"
  on-brand: "#ffffff"
  on-ink: "#ffffff"
  success: "#00652c"
  warning: "#7f4b00"
  danger: "#a62522"

typography:
  display-xl:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -2px
  display-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: -1px
  display-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.5px
  title-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  title-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  eyebrow:
    fontFamily: "Inter, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 1.5px
  nav-link:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6

rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 88px

components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    padding: 14px 28px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    rounded: "{rounded.pill}"
    padding: 14px 28px
    height: 48px
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    height: 64px
    border-bottom: "1px solid {colors.hairline}"
  hero:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    padding: "{spacing.section}"
  feature-card:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 28px
  step-card:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 28px
  faq-item:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
  footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    padding: 64px
---

## Overview

This is an **internal tool's onboarding page**, not a product being sold. Every choice below is filtered through that lens: no pricing, no "free trial," no invented usage metrics, no urgency copy. The job of this page is to tell a My Home Group site team what the tool does and get them to log in — nothing more.

**Canvas is white** (`{colors.canvas}` — #ffffff), not a tinted cream. The brand differentiator here isn't warmth, it's **restraint** — a clean paper surface that lets the one red accent do all the work. Body sections step down one notch to `{colors.surface-soft}` (#f8f6f7) for rhythm, matching the *exact same token* the in-app dashboard uses for its page background — this is the literal mechanism by which the landing page and the tool "match": they read the same CSS variables.

**Color trio:** brand red (`{colors.brand}`), ink (`{colors.ink}`), steel-blue (`{colors.steel}`). The steel-blue isn't decorative — it's a domain callback (this is a *steel* reconciliation tool) and it's the same `info` token the in-app Abstract grid uses for its computed-row labels. Red is reserved for exactly one thing per view: the primary action. Everywhere else, ink and steel do the work.

## Typography — and why not a serif pairing

The reference doc (Claude's marketing site) pairs a slab-serif display (Copernicus/Tiempos) with a humanist sans body — a literary, editorial voice that fits Anthropic's brand. **That pairing is wrong for this product, and we don't use it:**

1. **The existing brand mark is a bold geometric sans** (the My Home Group logo, and the in-app "Steel Recon" wordmark). A literary serif headline would visually fight the mark it sits next to, not complement it.
2. **The audience is site engineers and QS staff**, not an editorial/consumer audience. A serif display reads as "considered publication"; this audience wants "get in, understand the tool, log in" — clarity over atmosphere.
3. **Inter is already self-hosted and used everywhere in the actual product** (tabular numerals, dense grids, forms). Introducing a second typeface for the landing page only would mean the landing page and the tool — the two surfaces we're explicitly trying to make consistent — would visually diverge at the most basic level (the letterforms themselves).

Instead, voltage comes from **weight and negative tracking**: display sizes run at 700 weight with -1px to -2px letter-spacing (tight, confident), dropping to 600 for titles and 400 for body — the same lever Inter's variable font already gives us, no second font file, no licensing gap, no divergence from the app.

## Layout

- **Max content width:** 1120px, centered.
- **Section rhythm:** `{spacing.section}` (88px) vertical padding between major bands.
- **Hero is intentionally sparse:** eyebrow-free, single headline, one-line subtitle, one button. No stat badges, no embedded product screenshot, no scroll cues, no particle/canvas animation. The restraint *is* the content — this page is oriented, not sold.
- Below the hero: a **Features** grid (real capabilities, plainly described) with one supporting visual (a light-themed static preview of the actual Abstract grid — the real product, not an illustration), a **Walkthrough** (the real 4-stage flow), and a compact **FAQ** answering real operational questions a site team would actually ask.

## Motion

Scroll-reveal (fade + 8px rise) on section entry only, once per section, respecting `prefers-reduced-motion`. No per-character title animation, no floating/bobbing elements, no canvas particle networks. Motion here answers "did this section just appear," nothing more.

## Do's and Don'ts

### Do
- Keep the hero to headline + one-line subtitle + one button. Every additional element dilutes it.
- Reserve `{colors.brand}` for the single primary action per section (nav's Login, hero's Get Started, footer CTA if any). One red element per viewport.
- Use `{colors.steel}` for the one supporting accent that needs to read as "technical/data" (icons, the Abstract preview's computed-row labels).
- Show the *real* product (a static, honest preview of the Abstract grid) rather than an abstract illustration, once — in Features, not the hero.
- Write FAQ answers that are true today, for this internal tool, not aspirational sales copy.

### Don't
- Don't add pricing, trial periods, "Start Free Trial," or urgency language — this tool has no sales motion.
- Don't fabricate usage stats, customer counts, or "trusted by" logos.
- Don't switch to a serif display typeface — see the typography rationale above.
- Don't use a dark canvas for the marketing surface. White/near-white throughout; dark stays reserved for the in-app dark-mode toggle, not the landing page's default.
- Don't animate on every scroll tick or add ambient canvas/particle backgrounds — they read as filler, not craft.
