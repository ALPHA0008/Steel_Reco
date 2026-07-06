# Product Requirements Document
## Steel Reconciliation Platform

**Version:** 1.0 (v1 scope — manual entry, SAP integration deferred)
**Status:** Draft for kickoff
**Reference dataset used for design:** My Home APAS, Kokapet (455 files analyzed to ground the schema and rules below)
**v1 deployment scope:** Multiple My Home projects onboarded from the start — not limited to a single site

---

## 1. Executive Summary

### 1.1 Problem statement
Monthly steel reconciliation across My Home projects is assembled by hand at month-end by the site QS person, sourcing from hundreds of scattered Excel files (450+ per project), SAP GRN records, contractor-signed physical count annexures, and vendor slips. Errors — mis-classified cut pieces, unsequenced consumption entries, issue quantities exceeding stock, unverified bundle weights — accumulate silently and only surface at project close, when the loss is unrecoverable. There is no live view of wastage%, no structural block against physically impossible transactions, and no audit trail beyond signatures on paper.

### 1.2 Proposed solution
A multi-project, ledger-based web application where the QS person for each project enters steel transactions (GRN, issue, physical count, BBS, JMR, scrap sale) into a structured database instead of Excel. Every summary number in the monthly Abstract is computed from those transactions, never typed. A rules engine flags anomalies at the point of entry — not at month-end review — turning the QS person's job from "assemble from scratch" into "resolve flagged exceptions and export."

v1 deliberately excludes SAP integration and distributed multi-role entry. Both are Phase 5+ concerns, unblocked by evidence produced during the v1 pilot.

### 1.3 Success criteria (measurable)
| KPI | Baseline (current Excel process) | v1 target |
|---|---|---|
| Median time from steel event occurring to being visible in the ledger | ~30 days (month-end assembly) | ≤ 7 days |
| Rules-engine exceptions surfaced per month-end cycle, across onboarded projects | 0 (no engine exists) | ≥ 5 real anomalies caught before manual close would have caught them, per project |
| Time for QS person to close a month (data assembly + Abstract generation) | To be measured in Phase 0 as baseline | ≥ 50% reduction post-Phase 3 |
| Wastage% visibility cadence | Monthly, retrospective | Weekly, rolling |
| Physically impossible transactions accepted (e.g. issued > received) | Not tracked; known to occur | 0 (hard constraint at DB level) |

---

## 2. User personas

### 2.1 Primary — Site QS (one per project)
The only human user of the v1 system. Owns steel reconciliation for exactly one project. Currently spends the last ~5–7 days of every month assembling data from store, site engineers, contractors, and their own Excel history. Domain-expert in the Abstract layout, contractor billing terms, and wastage thresholds. Comfortable with Excel; uncomfortable with unfamiliar UI. **Adoption depends on the v1 dashboard looking like the Abstract they already produce.**

### 2.2 Deferred to later phases (mentioned for context only)
- Store keeper, site engineer, contractor rep — real-world data sources the QS collects from today; direct self-entry is a Phase 5+ decision, not part of v1
- QS admin head / supervisor — read-only oversight role; deferred, but the access model supports adding it later without schema migration
- Sr.DGM / GM / VP-Projects — final sign-off chain; continues on paper/email exactly as today in v1

---

## 3. Problem context (from artifact analysis)

Findings from reviewing the reference dataset provided (455 files from the APAS project, used to ground schema and rules design — the same file structures recur across other My Home projects' equivalent records):

1. **The master Steel Recon file computes "Total Quantity issued to Contractor" as equal to "Net Received Quantity" by formula, not by summing independent issue transactions.** This structurally prevents the current sheet from ever showing issue > receipt, even when it physically occurs.
2. **Cut pieces >1.5m have no dedicated field** — they are ambiguously either counted as consumption, hidden as "safety steel," or dropped from stock. This is one of the largest identified sources of silent quantity leakage.
3. **Bundle weight is approximated per dia** in Annexure-01 rather than verified against actual per-bundle weight, allowing gradual drift in stock counts to go unnoticed.
4. **Consumption is entered per contractor as a blended monthly number**, not per floor-per-bar-mark, so the "multiple floors in progress simultaneously" pattern that inflates WIP is not detectable from the reconciliation sheet.
5. **The BBS/JMR bar-mark-level data (in ~440 of the 455 files) is never computationally cross-checked against the store/consumption ledger** — the two systems only meet once monthly, in the QS person's head.
6. **Existing files are structurally consistent within each family** (shear walls, slabs, footings, columns), making automated parsing for backfill feasible with one parser template per family.

These findings drive the design of Sections 5 (schema), 6 (rules), and 7 (backfill).

---

## 4. User stories

### 4.1 Data entry
1. As a QS, I want to log a GRN (vendor, PO, dia, weighbridge weight, gate timestamp) in under 60 seconds, so I can enter receipts progressively through the month instead of batching them at month-end.
2. As a QS, I want to attach a weighbridge slip photo to each GRN, so the audit trail includes original evidence.
3. As a QS, I want to log an issue to a contractor with a linked GRN batch, so the ledger records which physical steel went where.
4. As a QS, I want to log an inter-site transfer (from-project, to-project, HO approval reference, loan/return flag, expected return date), so lending steel between My Home projects is trackable instead of living in ad-hoc email.
5. As a QS, I want to log a weekly physical stock count per contractor per dia — bundle count, loose rod count, cut-piece count — and be required to classify each cut piece as `reusable`, `used_as_safety_steel`, or `scrap`, so no cut piece falls into an ambiguous state.
6. As a QS, I want to upload a photo of the physical count, so contractor sign-off can happen digitally later without losing evidence.
7. As a QS, I want to log a scrap sale with buyer, weight, rate, and invoice reference, so scrap quantity flows into the wastage calculation instead of being tracked separately.
8. As a QS, I want to enter BBS planned quantities per bar mark, element, tower, floor, and dia, so planned vs. actual comparison happens inside the system.
9. As a QS, I want to enter JMR ("extra steel") measurements against a specific drawing reference, so extras are attributable and comparable to the RA bill.

### 4.2 Live dashboard (mirrors current Abstract)
10. As a QS, I want to see sections A through N of the monthly Abstract computed live at any point in the month, so I don't need to manually assemble them at close.
11. As a QS, I want the dashboard layout to match the current Excel Abstract column-for-column (dia-wise columns 8/10/12/16/20/25/32mm, activity-level rows), so I recognize what I'm looking at from day one.
12. As a QS, I want to see running wastage% updated weekly, not monthly, so I know before month-end whether I'm trending past the 3% cap.
13. As a QS, I want to see planned (BBS) vs. actual (JMR + issue) side by side per tower/floor, so I can spot deviations while there's still time to investigate.

### 4.3 Exception review
14. As a QS, I want an exceptions inbox showing every rule violation flagged since I last reviewed, so I don't have to hunt through the whole ledger.
15. As a QS, for each flagged exception, I want to see the underlying transaction, the rule that fired, the threshold, and the current value, so I can decide whether it's a real problem or a threshold to tune.
16. As a QS, I want to resolve each exception with one of: approve-as-is (with mandatory reason), correct the underlying transaction, or mark for follow-up, so every exception has a closed state.
17. As a QS, when the rules engine would block an entry (issue exceeding stock, unclassified cut piece), I want a clear error message explaining exactly which constraint failed, so I can fix it at the point of entry.

### 4.4 Month close and export
18. As a QS, I want a "finalize month" action that locks all transactions for that period against further edits, so the Abstract can't be silently changed after sign-off.
19. As a QS, I want to export the finalized month's Abstract in the exact current Excel/PDF layout, so the existing sign-off chain (KLC → GLC → Stores → Sr.DGM → GM → VP) can continue on paper/email without disruption.
20. As a QS, if I discover a data error after finalizing, I want a "request re-open" action that requires a written reason and is logged, so corrections are possible but leave an audit trail.

### 4.5 Multi-project scoping
21. As a QS on Project A, I want to see only Project A's data — never any other project's — so I can't accidentally cross-post transactions.
22. As a QS, I want to log in and land directly on my project's dashboard without picking from a project list, so the tool feels project-specific to me.

### 4.6 Legacy backfill (one-time, Phase 2)
23. As a QS onboarding to the system for the first time, I want the operator to bulk-load my existing BBS and JMR Excel files into the ledger as historical rows, so I don't start from zero and the dashboard immediately reflects real project history.
24. As a QS, I want to review a backfill report showing how many rows loaded successfully vs. rejected, and see the reason for each rejection, so I can trust the historical numbers.

### 4.7 Audit
25. As a QS, I want every write to my project's ledger — mine or the system's — to be timestamped with user, action, and before/after values, so any number in the Abstract can be traced to its source event.

---

## 5. Data architecture

### 5.1 Design principles
- Every transaction table carries `project_id`. Multi-project is a schema property, not a future migration.
- Summary/derived values are never stored as columns on transaction rows. The monthly Abstract is a query, not a table.
- Every write goes to an `audit_log` row alongside the transaction it corresponds to.
- Transaction tables are append-only in behavior. Corrections happen via new rows referencing the corrected one, not by mutating history.

### 5.2 Shared master tables (company-wide, not project-scoped)
- `vendors` — name, GST, dia catalog they supply
- `contractors` — company profile (KLC, GLC, and future)
- `dia_grades` — 8/10/12/16/20/25/32mm and Fe grade
- `rule_thresholds` — default anomaly thresholds; overridable per project via a scoped row

### 5.3 Project-scoped transaction tables (all keyed by `project_id`)
- `projects` — project identity, site location, active/closed status
- `towers`, `floors`, `elements` — hierarchical structure for a project's physical scope (element type: footing, column, shear wall, slab, staircase, ramp, retaining wall, misc)
- `grn` — vendor, PO reference, dia, weighbridge weight, gate timestamp, slip photo URI
- `inter_site_transfer` — from-project, to-project, HO approval reference, loan/return flag, expected return date, actual return date
- `store_issue` — contractor, dia, quantity, issuing staff name, linked GRN batch reference
- `bbs_plan` — bar mark, element ref, tower, floor, dia, planned weight
- `jmr_actual` — same keys as `bbs_plan` plus pour number, drawing reference, measured weight
- `physical_count` — contractor, dia, bundle count, loose rod count, cut-piece count with three-way classification (`reusable` / `used_as_safety_steel` / `scrap`), photo URI, count date
- `scrap_sale` — buyer, weight, rate, invoice reference, sale date
- `monthly_abstract_snapshot` — locked, immutable snapshot generated at month-end; contains the computed sections A–N at the moment of finalize

### 5.4 System tables
- `users` — identity, role (`QS` in v1)
- `project_assignments` — user_id → project_id (one row per QS in v1; extensible to many-to-many later)
- `audit_log` — user, timestamp, table, row_id, action, before_json, after_json
- `exception_log` — rule_id, transaction_ref, threshold, actual_value, status (open/resolved), resolution_type, resolver_reason

---

## 6. Rules engine specification

Every rule ships in one of two modes: **advisory** (records an entry in `exception_log`, does not block the write) or **blocking** (rejects the write at the API layer with a clear error). The default at v1 launch is advisory for all judgment-based rules, blocking for pure form-validation rules.

| Rule | Trigger | Threshold source | Launch mode | Promotion path |
|---|---|---|---|---|
| Issue-exceeds-stock | On `store_issue` insert | `sum(grn) − sum(issue)` per contractor+dia < requested qty | Advisory in Phase 2, blocking in Phase 3 | After 2 real cycles confirm no false-positives |
| Sequencing violation | On progress marking a floor as consumed | Floor N-1 must be complete first, per tower + contractor | Advisory | Kept advisory — legitimate exceptions exist |
| Bundle weight variance | On `physical_count` insert | Per-bundle weight vs. rolling avg for dia+vendor, ±2% band | Advisory | Threshold tunable via `rule_thresholds` |
| Cut-piece classification missing | On `physical_count` insert | Any cut-piece row lacks classification value | Blocking from day one | N/A — this is form validation |
| Wastage trend | Nightly batch job | Running wastage% within X% of contract cap (default 3%) | Advisory | Kept advisory |
| Chair/spacer count deviation | On `bbs_plan` insert | Count per element type vs. standard range | Advisory | Kept advisory |
| Cross-check: BBS vs issue | Nightly batch job, per tower | Divergence between planned bar-mark weight and issued weight > Y% | Advisory | Kept advisory |

Rules engine execution model: rules run synchronously in the write path for transactional rules (rows 1–4, 6), and as a nightly job for batch rules (rows 5, 7). Each execution writes to `exception_log`.

---

## 7. Legacy Excel backfill (Phase 2)

### 7.1 Scope
Parse existing per-project Excel backups (BBS, JMR, Steel Recon, Store Report, physical count annexures) into the appropriate transaction tables as historical rows, for every project being onboarded — not a one-time exercise limited to a single site. The reference project (Section 1 footnote) alone accounted for ~455 files during design analysis; each additional onboarded project brings its own equivalent volume, using the same parser templates from Section 7.2.

### 7.2 Approach
One parser template per file family, not one universal parser. Observed families from artifact analysis:
- Per-floor shear wall / slab / footing / column BBS files (consistent column layout within each family)
- JMR "extra steel" abstracts
- Master Steel Recon Abstract
- Store Report vendor tables
- Contractor annexures (01, 02)
- Scrap register

### 7.3 Error handling
Backfill runs produce a report per file: rows loaded, rows rejected, rejection reason. Rejected rows are surfaced to the QS for manual review and re-import — never silently dropped. A backfill run is idempotent — re-running a file replaces its prior load, doesn't duplicate.

### 7.4 Non-goal
The backfill is not designed to handle every file exactly. Outliers (unusual formatting, missing columns) will require manual cleanup. Success criterion is ≥ 90% of rows in structurally-consistent families loading without human intervention.

---

## 8. Non-functional requirements

| Requirement | Target |
|---|---|
| Page load (dashboard, ≤ 12 months of data) | < 2s at p95 |
| Transaction entry write latency | < 500ms at p95 |
| Nightly rules batch run duration | < 15 min for one project's full ledger |
| Concurrent QS users on same project | 1 in v1 (extensible later) |
| Data retention | Indefinite; monthly snapshots immutable once finalized |
| Backup RPO / RTO | RPO 24h, RTO 4h (v1 baseline; revisit at Phase 5) |
| Photo storage | Object storage; URIs stored on transaction rows |
| Browser support | Latest Chrome and Edge; other browsers best-effort |
| Mobile support | Responsive web only in v1 — no native app |

---

## 9. Security and access

- Authentication: username/password with password policy TBD by IT/PMO, or SSO if My Home has a company identity provider (confirm during Phase 0)
- Authorization: role-based; `QS` role scoped by `project_assignments` to exactly one project's data in v1
- All API endpoints must enforce project scope server-side; the frontend must not be trusted to filter
- Audit log is append-only; no user role has delete permission on `audit_log`
- Photo uploads scanned for size (max 5MB) and MIME type (image/jpeg, image/png only)
- Hosting policy (cloud provider, region, on-prem vs. cloud): TBD, awaiting PMO/IT confirmation before Phase 1 begins

---

## 10. Technical decisions

- **Database:** PostgreSQL. Chosen for relational integrity, transactional guarantees needed by the ledger model, and native support for the constraint-based blocking rules in Section 6.
- **Backend framework:** Choice between NestJS (Node) and FastAPI (Python) deferred to Phase 0, driven by dev team availability. The choice does not affect any decision in this PRD.
- **Frontend:** React with a table-dense component library (Material UI, Ant Design, or equivalent). Rationale: the QS cockpit is heavy on tabular Abstract displays; libraries with weak table primitives will slow delivery.
- **Legacy parser:** Python with `openpyxl` + `pandas`. Distinct from application code — this is a batch tool, not a web service. Can be run by a developer during onboarding of each new project.
- **File storage:** Object storage (S3-compatible or equivalent, per hosting decision) for photos.
- **Reporting export:** Server-side generation of the Abstract Excel and PDF via a templating library (e.g. `openpyxl` for Excel to match existing layout exactly; PDF generated from HTML).

Interfaces where seams are drawn for testability (external behavior, not internals):
- **Ingestion API layer** — every transaction entry hits this; testing here validates all write paths and rule enforcement together
- **Reporting/computed-view layer** — every dashboard number goes through this; testing here validates that the computed Abstract matches manually-verified expected values
- **Legacy parser output** — testable in isolation with sample real Excel files as fixtures

---

## 11. Testing strategy

### 11.1 What makes a good test
Tests validate observable behavior at API and computed-view boundaries. Internal helpers, private query implementations, and UI DOM structure are not directly tested. This matches the seam guidance in Section 10: test at the ingestion API and the reporting layer.

### 11.2 Test types required
- **Unit tests:** rules engine logic (each rule with pass/fail fixtures), Abstract computation functions (input transactions → expected computed value)
- **Integration tests:** full write-path per transaction type, including rules firing and audit log writing
- **Regression tests:** for the reporting layer, at least one real month's transactions per onboarded project as a fixture, with the known-correct Excel Abstract as expected output — starting with the reference project, extended as each new project onboards. Every code change must reproduce all fixtures exactly
- **Backfill tests:** each parser template tested against 3–5 real files from that family, with expected row counts

### 11.3 Acceptance criteria for v1 launch
- All rules from Section 6 pass their unit tests
- Each onboarded project reproduces at least one real month, from manually-loaded transactions to computed Abstract, with < 0.1% variance per section — validated first against the reference project, then against every other project onboarded in the same wave
- Backfill parses each onboarded project's historical files with ≥ 90% row-load rate in structurally-consistent families (the reference project's ~455 files being the first, not the only, set validated)
- Zero physically-impossible transactions accepted by the API (issue > stock, unclassified cut piece)

---

## 12. Phased rollout

| Phase | Duration | Scope | Exit criteria |
|---|---|---|---|
| **0 — Discovery** | 2 weeks | Shadow QS people through one real month-end close, across the initial cohort of projects being onboarded; lock Abstract layout using the reference project as a starting point; agree v0 rule thresholds; confirm hosting/auth policy with PMO | Signed field list + threshold sheet, validated against more than one project's QS; PMO infra decision on record |
| **1 — Ledger + mirror dashboard** | 6–8 weeks | Core tables (`grn`, `store_issue`, `inter_site_transfer`, `physical_count`, `scrap_sale`); entry forms; live Abstract dashboard mirroring current layout; each project in the initial cohort gets its own QS account, scoped by `project_id` from day one — no single-project gate | Each onboarded project's real month reproduced live from system-entered transactions, verified against that project's own manual Excel |
| **2 — Rules engine + backfill** | 4–6 weeks | All rules from Section 6 in advisory mode; exceptions inbox UI; legacy parser for 5 file families; historical backfill run per project in the cohort | Exceptions inbox usable on every onboarded project; ≥ 90% row-load rate on backfill for each |
| **3 — Parallel validation** | 4 weeks | Run alongside each onboarded project's real Excel process for one full month-end cycle; log every early-catch event per project; promote issue-exceeds-stock to blocking once confirmed across the cohort | Documented count of exceptions the system flagged before the manual process would have, per project — this is the PMO pitch evidence, and it's stronger with multiple projects' data than one |
| **4 — PMO pitch (parallel)** | 1–2 weeks | Present Phase 3 evidence across the onboarded cohort; request narrow SAP asks (one-time historical export first; scoped read-only endpoint second, only if first lands) | PMO decision on SAP scope |
| **5 — Full company rollout** | Ongoing | Onboard the remainder of My Home's project roster beyond the initial cohort; confirm shared vendor/contractor masters against any central company data source; the backfill parser is already proven across multiple projects by this point, not just one | Each new project's QS producing a live Abstract within [X] weeks of onboarding start |
| **6 — Realtime + intelligence** | Later | SAP live endpoint (if approved), anomaly-detection model on ≥ 6 months of accumulated ledger history across all onboarded projects, cross-project contractor scorecards | Out of scope for v1; separate PRD |

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| QS batches entry monthly instead of weekly, reproducing the current problem in a new UI | High | High | Make weekly entry cadence an explicit Phase 1 pilot practice, not just a technical possibility. Measure time-to-visibility as a Section 1.3 KPI |
| Legacy Excel files' inconsistency breaks the parser more than expected | Medium | Medium | One parser per family; accept manual cleanup for outliers; success bar set at 90%, not 100% |
| Advisory rules generate too much noise, QS disengages from exceptions inbox | Medium | High | Advisory-only launch; use Phase 3 feedback to calibrate thresholds before Phase 5 |
| PMO/executive pressure to skip validation entirely and roll out to the full company roster before any project has completed Phase 3 | Medium | High | Phases 1–3 validate against the initial cohort (multiple projects, not just one) in writing in this PRD; Phase 5's full-roster rollout is contingent on documented outcomes from that cohort, not on a single site's results |
| SAP historical export ask stalls in IT review | Medium | Medium | v1 does not depend on it. Backfill from Excel files (already in hand) is the primary data source. SAP export is upside, not critical path |
| Abstract layout in the UI drifts from the QS person's expectations, hurting adoption | Medium | High | Phase 0 exit criterion is a signed-off layout diff; regression test in Section 11 pins the exported Abstract to a known-good real file |
| Hosting/auth decision from PMO delays Phase 1 start | Medium | Low | Phase 0 explicitly closes on this before Phase 1 begins |

---

## 14. Out of scope for v1

- SAP integration (live endpoint or historical export) — Phase 4/5, gated on Phase 3 evidence
- Direct data entry by anyone other than the QS person (store, site engineers, contractors) — Phase 5+
- Digital sign-off routing through Sr.DGM / GM / VP — Phase 5+; existing paper/email chain continues unchanged
- Supervisor / QS admin head account — schema supports it but no UI in v1
- Native mobile apps — responsive web is sufficient for v1
- Intelligence layer (anomaly detection models, contractor scorecards) — Phase 6; requires ≥ 6 months of real ledger history
- Automated flow of computed values from this system into any other reporting/BI layer — Phase 5+
- Non-steel material reconciliation (cement, aggregate, etc.) — out of scope entirely; separate PRD if required

---

## 15. Open questions (to close during Phase 0)

1. Hosting/infra policy — cloud vendor, region, or on-prem?
2. Authentication — password-based or company SSO?
3. Does My Home have a central vendor/contractor master data source anywhere (procurement system, SAP master data), or does this application own that master from day one?
4. Is there an internal dev team allocated to this, or is it going to an external vendor? This drives backend framework choice.
5. What is the exact acceptable variance between the current manual Excel Abstract and this system's computed Abstract during Phase 1 validation — 0.1% (the current draft target) or tighter?
6. What is the current baseline for "time for QS person to close a month" — needs to be measured in Phase 0 to make the 50% reduction KPI concrete

---

## 16. Further notes

- The full artifact analysis and design conversation that preceded this PRD is preserved in project chat history. Section 3 ("Problem context") summarizes the file-level findings that most directly shaped the schema and rules.
- The multi-project architecture is not a future-proofing gesture — v1 launches with multiple projects onboarded, not one. Every table's `project_id` column is what makes onboarding project N a matter of "add a row, provision a QS account" rather than "migrate the schema," starting from the very first cohort, not deferred to some later phase.
- The core architectural invariant of the whole design is: **no summary number is ever typed by a human.** Every value in the monthly Abstract is a query. Reviewers of this PRD should treat any implementation decision that violates this as a red flag.
