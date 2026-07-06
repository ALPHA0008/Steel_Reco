# Steel Reconciliation — Process & Validation (Spec of Record)

**Status:** Authoritative spec for *what* the tool does and *why*. `IMPLEMENTATION_PLAN.md` is the *how/when* build plan and references this document.
**Created:** 2026-07 (after the reporting-officer meeting), to capture the strategic reframing below.
**Scope now:** the immediate deliverable is a **manual data-entry tool** that (1) enforces one unified process across sites and (2) validates every entered number against the handful of documents we can actually trust.

---

## 0. The strategic frame (read this first)

The old goal — "an intelligence layer on top of SAP" — is premature. The real problem is upstream of any analytics:

- **Different sites follow different processes.** There is no single, enforced flow from steel order to monthly reconciliation.
- **The data itself is often wrong** — whether it lives in SAP, Excel, or on paper. A number being *in SAP* does not make it *true*. SAP faithfully stores whatever was entered, including mistakes.
- **Therefore we trust almost nothing by default.** Every number is guilty until reconciled to a document we *can* believe.

So the sequence is deliberate:

> **Enforce a unified process → capture clean data → validate against ground truth → catch the leakage → *prove* the savings → earn the mandate to enforce across all sites → then, and only then, layer intelligence on top.**

The tool is the wedge. Even a manual data-entry tool that catches 3–4 of every 10 issues today is enough to stand in front of leadership and say *"this much steel could have been saved."* That number is what gets eyeballs on the project and buys the authority to standardize the process everywhere.

**How we prove it:** run the tool against a **historical, already-closed month** where the real Excel reconciliation exists. Our tool must either (a) **match** the existing reco where the old process was genuinely fine — proving correctness — or (b) **catch** something the old process hid — proving value. Both outcomes build trust. We never ship a number we can't trace back to a source row.

### 0.1 On this document list — it is a living catalogue, not gospel

The document chain below is our **current working model** of the real-world flow. It may list **more or fewer** documents than any given site actually uses in practice. That is expected and useful:

- Where a listed document **doesn't exist** at a site, that gap *is* a finding — it usually means a validation checkpoint is missing, which is exactly the kind of process hole we're here to close.
- Where a site uses a document we **haven't listed**, we add it — each new document is a potential new validation anchor.

The point of cataloguing documents now is not to model reality perfectly on day one. It is to make every stage of the process an explicit, referenceable step in the tool, so that (a) the process becomes uniform and (b) each document becomes a lever for validating the next number in the chain. The list will grow and shrink as we learn the true flow at each site. **We plan in this direction; we do not freeze it.**

---

## 1. The end-to-end document chain (procure → reconcile)

Every steel unit passes through this chain. The month-end QS is effectively re-assembling all of it from ~12 document *types* (hundreds of individual documents per project per month). ✅ = known to exist digitally in our world today.

| # | Stage | Document | Produced by | What it proves | Typical form |
|---|-------|----------|-------------|----------------|--------------|
| 1 | Demand | **Indent / Purchase Requisition** | Site QS / engineer | How much was *asked for* (should trace to BBS) | SAP / Excel |
| 2 | Order | **Purchase Order (PO)** | Central procurement | Contractual qty (dia-wise) + rate | SAP ✅ |
| 3 | Dispatch | **Tax Invoice + E-way bill** | Supplier (JSW / Tata / etc.) | GST-tracked qty, rate, vehicle | Hard / PDF ✅ |
| 4 | Quality | **Mill Test Certificate (MTC)** | Supplier mill | Grade / heat / section weight | Hardcopy |
| 5 | Gate | **Security gate-inward register** | Site security | Vehicle in, time, seal | Hardcopy / register |
| 6 | Weight | **Weighbridge slip (gross / tare / net)** | Site weighbridge | *Physically measured* received weight | Hard / slip |
| 7 | QC | **Site inspection / acceptance report** | Site QC | Accepted vs rejected qty | Hard / Excel |
| 8 | Receipt | **GRN (Goods Receipt Note)** | Store | Accepted qty booked to stock | SAP (MIGO) ✅ |
| 9 | Storage | **Bin card / stock register** | Store keeper | Running stock per dia | Register / Excel |
| 10 | Issue | **Material Issue Slip** | Store → contractor | Qty handed to contractor / gang | SAP / Excel / slip |
| 11 | Transfer | **Inter-site transfer challan** | Store | Steel leaving to another site | Challan |
| 12 | Plan | **BBS (Bar Bending Schedule)** | Design / QS | *Theoretical* steel per element | Excel ✅ |
| 13 | Execution | **Pour card / concrete pour register** | Site engineer | Which element was actually cast | Hard / checklist |
| 14 | Claim | **Contractor RA bill** | Contractor | Contractor's claimed work (the "contractor invoice") | Excel / hard |
| 15 | Measure | **JMR (Joint Measurement Record)** | QS + contractor | *Jointly measured* actual work | Hard / Excel |
| 16 | WIP | **Progress / % completion report** | Site engineer | In-progress element weightage | Excel |
| 17 | Offcuts | **Cut-piece / scrap register** | Store | Reusable vs scrap | Register / Excel |
| 18 | Count | **Physical stock verification sheet** | QS + store (month-end) | Actually-counted closing stock | Hard / Excel |
| 19 | Disposal | **Scrap sale note / invoice** | Store / accounts | Scrap sold out | Hard / SAP |
| 20 | Output | **Monthly Steel Reconciliation Abstract (A–N)** | QS | Ties everything together | Excel |

---

## 2. Trust tiers — the rule that governs the whole tool

Every number the tool holds is assigned a tier. This is the formal version of *"only BBS + PO + invoices are believable."*

**Tier 1 — Ground truth** (independently verifiable, hard to game, originates *outside* the site's own bookkeeping):
- **BBS** — derived from stamped structural drawings. The truth for *how much steel an element should contain*.
- **PO** — contractual, centrally approved, dia-wise.
- **Supplier tax invoice + e-way bill** — GST / government-tracked; quantity is hard to fabricate.
- **Weighbridge net weight** — a *physical measurement* (caveat: calibration can drift or be gamed, but it is not a typed number).

**Tier 2 — Must be validated** (human-entered at the site; this is where leakage lives):
- GRN, issue slips, JMR / progress %, physical stock, cut-piece / scrap classification.

**Tier 3 — Derived / never trusted directly** (only as good as its inputs — this includes **all of SAP**):
- Net received, "issued to contractor," consumption, WIP, wastage %.

> **Governing rule:** a Tier-2 or Tier-3 number is only allowed to stand if it reconciles to a Tier-1 anchor within tolerance. Otherwise the tool raises an exception. This is why "SAP will fix it" is false: SAP sits in Tier 3.

---

## 3. The validation matrix — the tool's actual brain

Each row is a cross-check the tool enforces. This is what "catches the issues" and what lets us later quantify *"₹X of steel could have been saved."* ✅ = already built and verified in the backend.

| Check | Compares | Anchored to | Catches |
|-------|----------|-------------|---------|
| **Inbound reconciliation** | Invoice qty ↔ e-way bill ↔ weighbridge net ↔ GRN accepted | Tier 1 | Short-received / over-booked receipts, bundle-weight drift |
| **PO discipline** | Σ GRN ≤ Σ PO (+ tolerance) | PO | Receiving beyond order |
| **Stock invariant** ✅ | Σ issues ≤ available stock | — | Issuing more than exists (the headline bug) |
| **Issue = genuine sum** ✅ | D = Σ issue rows, *not* "= net received" | — | The legacy Excel formula that hides issue > receipt |
| **Consumption vs BBS** | Steel issued for an element ↔ BBS theoretical ± wastage | **BBS** | Over-consumption / wastage gaming |
| **WIP legitimacy** | Progress % ↔ pour card ↔ BBS | BBS + pour | Claiming WIP on un-poured elements |
| **Wastage cap** ✅ | wastage % ≤ 3% | — | Contractual breach (APAS = 4.97%) |
| **Cut-piece rule** ✅ | pieces ≤ 1.5m must be scrap | — | Biggest leakage per PRD |
| **Closing identity** | Opening + Received − Issued − Consumed − WIP = **Physical count** | Physical | Unexplained loss |

The **closing identity** is the master reconciliation. When book stock and physically-counted stock don't match, the residual *is* the leakage — and today the Excel abstract quietly absorbs that residual instead of flagging it.

---

## 4. What we already have vs. what this adds

**Built and verified (16 tests passing against a real Postgres):** the *middle* of the chain — GRN → issue → transfer → BBS → JMR → physical count → scrap → the full A–N Abstract, plus the stock invariant, cut-piece rule, wastage cap, and month-close lifecycle.

**The gap this reframing exposes:**

> Today the tool treats the **GRN as a trusted entry point**. The trust-tier model says the GRN is **Tier-2** and must itself be validated against PO + invoice + weighbridge.

So we need to extend the tool **upstream of the GRN** — capture PO, supplier invoice / e-way bill, weighbridge, and QC — so the GRN becomes a *reconciled* number, not merely an *entered* one. This is an **additive** extension: it adds new entities *before* the GRN and a validation layer *on top* of it. It does not modify any of the 8 downstream tables, the RLS design, the invariant, the A–N formulas, or month-close. Nothing already built breaks. (See `IMPLEMENTATION_PLAN.md` §3.5 and §9 for the concrete schema and sequencing.)

---

## 5. Bottlenecks (the honest list)

1. **Ground truth isn't all digital.** BBS ✅ and PO / invoice ✅ mostly are, but weighbridge slips, gate registers, pour cards, and MTCs are paper and vary by site. Getting them in means manual entry or OCR.
2. **No pour-to-BBS linkage anywhere today.** Without it, "consumption vs BBS" and "WIP legitimacy" can't be automated — they stay manual judgment.
3. **The external per-tower "STEEL ABSTRACT" workbooks** (that sections E/F reference) are still not in hand.
4. **Cumulative ledger, no opening balance.** APAS is mid-construction, so we *must* backfill history before day-one numbers are right.
5. **SAP export format / access unknown.** We don't yet know what SAP will actually give us (MIGO GRNs? POs? in what format?).
6. **Adoption / behaviour.** The tool only produces good data if people enter each stage. The tool has to *be* the process, not sit beside it — which is why every stage references the prior one (a GRN must cite a PO; an issue must draw from stock; a JMR must cite a BBS element). A site can't skip a step because the next step won't accept an orphan record.

---

## 6. The plan (matches the strategy in §0)

**Phase A — Capture + validate against ground truth (the wedge).**
Add the upstream documents (PO, invoice / e-way, weighbridge, QC) and execution documents (pour, RA / JMR) as first-class, referenceable entities, and turn on the validation matrix. Every stage becomes a required, validated step that cites the prior one. *This referencing requirement is how the tool enforces a unified process.*

**Phase B — Back-test on a closed month to quantify savings (the eyeball-getter).**
Take a historical, already-closed APAS month with its real Excel reco. Run the tool's validation over the same source data and produce a diff: *"legacy abstract shows wastage 4.97% and balances; our tool flags X MT unexplained loss, Y over-cap wastage, Z cut-piece leakage — ₹___ that could have been caught."* This single comparison is the pitch to leadership and doubles as the <0.1% acceptance gate.

**Phase C — Buy-in → enforce + expand.**
Once leadership sees the number, secure the mandate to enforce the unified process across sites via administration, then layer intelligence (trend detection, SAP ingestion, anomaly detection) on top of *clean* data.

---

## 7. Documents to gather (prioritized)

Get them in this order — this order is what unlocks validation, not just completeness.

**Highest value (Tier-1 anchors — nothing validates without these):**
1. **BBS** for a few completed towers in APAS (ideally the ones behind the missing external "STEEL ABSTRACT" workbooks).
2. **POs** for APAS steel (dia-wise qty + rate).
3. **Supplier invoices + e-way bills** for a sample of receipts.
4. **Weighbridge slips** for those same receipts (to prove the invoice ↔ weighbridge ↔ GRN cross-check on real data).

**Next (to close the loop on one historical month — the back-test fuel):**
5. One **fully-closed month's** complete document set for one tower — GRNs, issue slips, transfers, JMR / RA, physical stock sheet, scrap notes — **plus its final Excel abstract**.
6. A few **pour cards**, to see how execution ties to BBS.

**To scope integration:**
7. A sample **SAP export** (whatever MIGO / PO screens give), so we know its real format.

---

## 8. Open decisions

1. **Which site / tower is the back-test benchmark?** APAS is the default; if another site has cleaner month-end docs, that's a better proof.
2. **Build upstream capture (PO / invoice / weighbridge) now, or keep GRN trusted for the first back-test and add upstream in Phase A-2?** *Recommendation:* keep GRN trusted **just** for the historical back-test (that history is already frozen, so validating it upstream adds little), but build upstream capture as the **first** new thing for going-forward data — fast proof without under-building the real tool.
3. Everything still open in `IMPLEMENTATION_PLAN.md` §11 (per-tower workbooks, M=K/G, MH-stock-at-site gap, history-import mechanism, Excel export library, hosting, auth, master-data ownership, variance tolerance).

---

*This document is the spec of record for the reconciliation tool's purpose, trust model, and validation logic. It is intended to be revised as we learn the true document flow at each site — see §0.1.*
