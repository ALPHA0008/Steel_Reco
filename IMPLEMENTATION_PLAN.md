# Steel Reconciliation Platform — Ultimate Implementation Plan (v1, PostgreSQL)

**Status:** Build-ready blueprint
**Aligns with:** `steel_reconciliation_prd_v1.md` — its requirements, domain analysis, phases, and success criteria all stand. This document is the concrete, file-level, technology-locked build plan.
**Stack:** PostgreSQL · FastAPI + SQLAlchemy 2.0 (async) + Alembic (Python) · React + TypeScript + Vite (MUI DataGrid)
**Grounded in real artifacts:** master Abstract `Steel Recon 28.04.2026…xlsx`, `Steel STORE REPORT-28.03.2026.xlsx`, `Steel Scrap Details.xlsx`, BBS `1.CLUB HOUSE Footings.xlsx`.
**Cloud path:** local/managed Postgres now → managed cloud Postgres (RDS / Cloud SQL / Azure Flexible Server / Aurora) later is a connection-string migration, not a rewrite.
**Spec of record:** `PROCESS_AND_VALIDATION.md` owns *what/why* — the document chain, trust tiers, and validation matrix. This document owns *how/when* (schema, mechanisms, build order) and implements that spec.

---

## 0. Database rationale (decided: PostgreSQL)

This app is a **financial ledger**. Its entire value is integrity — catching issue > receipt, stopping cut pieces from vanishing, guaranteeing no summary number drifts. Those are exactly the guarantees a relational engine provides natively, which is why Postgres is the right fit and why the PRD specced it (§10).

What Postgres gives this system **at the database level** (not in hand-written app code):
- **`issue > stock` enforced transactionally** with row locking / advisory locks, plus an optional trigger backstop when promoted to blocking.
- **Tenant isolation via Row-Level Security (RLS)** — a real DB guarantee, not query discipline.
- **Cut-piece classification** as a child table with `NOT NULL` + `CHECK` enum — the DB itself rejects an unclassified cut piece (closes the biggest leak, PRD §3.2).
- **Referential integrity** (FKs on vendor/contractor/project) and **`NUMERIC`** exactness for weights/money (the source sheets show float drift like `302.082000000004`).
- **Real DDL migrations** via Alembic.

Where the data is genuinely irregular — the BBS/JMR bar-mark rows with 7 mostly-empty dia columns — we use **`JSONB` columns** for the sparse per-dia payload, so we keep document-style flexibility exactly where it helps without giving up relational integrity everywhere else.

**Core invariant (unchanged, PRD §16):** *no summary number is ever typed by a human.* The Abstract (sections A–N) is a **SQL query**, never a stored value — with one deliberate exception, the immutable `monthly_abstract_snapshot` frozen at finalize.

**Onboarding a mid-construction project is not optional history — it's a Phase-1 requirement, not deferred to Phase 2.** The Abstract is *cumulative*: section H (Theoretical Stock) and every downstream section depend on every prior month's transactions since project start (there is no "opening balance" concept in the legacy sheet — C, D, E, F all sum from day one). A project onboarding mid-construction with no SAP live feed **cannot start from an empty ledger** — day-one numbers would be wrong from the first Abstract. This means: **the legacy Excel backfill (PRD §7, originally scoped as Phase 2) must be available before Phase 1 exit for any project that isn't greenfield.** APAS itself is exactly this case. The Phase-1/Phase-2 split still holds for *tooling maturity* (5 parser families, ≥90% row-load, exceptions inbox), but the *capability* to load full history — even via manual CSV/SQL import as a stopgap — must exist before any real onboarded project's Abstract can be trusted. This is now reflected in §9's build order and §11's open items.

---

## 0.5 Scope reframing (2026-07): the tool is a process-enforcement + validation layer

Following the reporting-officer meeting, the near-term goal is stated explicitly (full rationale in `PROCESS_AND_VALIDATION.md` §0):

> **Ship a manual data-entry tool that (1) enforces one unified process across sites and (2) validates every entered number against the few documents we can actually trust.** SAP is *not* a source of truth — it faithfully stores whatever was entered, mistakes included. The tool's value is proven by back-testing it against a historical, already-closed month: it must either **match** the existing reconciliation (proving correctness) or **catch** what the old process hid (proving savings). That number earns the mandate to standardize the process everywhere; intelligence/analytics come later, on top of clean data.

Three consequences for this build plan, **all additive — nothing already built changes**:

1. **Trust tiers govern validation.** Every number is Tier-1 (ground truth: BBS, PO, supplier invoice + e-way bill, weighbridge net weight), Tier-2 (must be validated: GRN, issues, JMR, physical count, cut-piece class), or Tier-3 (derived / never trusted directly — including all of SAP). A Tier-2/3 number may only stand if it reconciles to a Tier-1 anchor within tolerance; otherwise the tool raises an exception. The validation matrix (`PROCESS_AND_VALIDATION.md` §3) is the enumerated set of these cross-checks.

2. **The tool boundary moves upstream of the GRN.** Today the GRN is our *trusted entry point* (§3, §4-A). Under the trust-tier model the GRN is Tier-2 and must itself be validated against its PO + supplier invoice + weighbridge. So we **add** upstream document entities (§3.5) and an inbound-reconciliation check — *before* the GRN in the chain — without touching the 8 downstream tables, RLS, the invariant, the A–N formulas, or month-close. **Clarification of an earlier assumption:** "GRN is trusted" holds **only** for the historical back-test (that history is frozen; validating it upstream adds little). Going-forward GRNs are validated upstream.

3. **The document catalogue is a living model, not a fixed contract.** The chain in `PROCESS_AND_VALIDATION.md` §1 may list more or fewer documents than a given site uses. A listed-but-absent document is itself a finding (a missing validation checkpoint); a site-specific document we haven't listed gets added as a new anchor. Schema for upstream docs (§3.5) is therefore designed to be extended, and every new document type is nullable/optional until a site's real flow confirms it — so partial adoption never blocks data entry.

---

## 1. Architecture at a glance

```
                    React + TS (Vite, MUI DataGrid)
                              │  HTTPS / JWT
                    ┌─────────▼──────────┐
                    │  FastAPI routers   │  thin — HTTP in/out only
                    ├────────────────────┤
                    │  Service layer     │  one per transaction type; opens the DB txn,
                    │  (write orchestr.) │  calls rules + audit; enforces month-lock
                    ├──────────┬─────────┤
        ┌───────────┤ Rules    │ Audit   ├───────────┐
        │           │ engine   │ service │           │
        │           └──────────┴─────────┘           │
        │   Repository layer (ONLY code touching SQLAlchemy;          │
        │   sets app.current_user_id / project on the session)        │
        └───────────────────────┬─────────────────────────────────────┘
                    ┌───────────▼───────────┐
                    │   PostgreSQL           │  RLS policies, CHECK/FK constraints,
                    │                        │  NUMERIC, JSONB for sparse BBS/JMR
                    └────────────────────────┘
        Batch: tasks/ (nightly rules)   Batch: parser/ (Phase-2 Excel backfill, shared Python codebase)
```

**Layering rule:** routers → services → (rules + audit) → repositories → DB. The **repository layer is the only place** that touches SQLAlchemy; it also sets the per-request session GUCs (`app.current_user_id`, `app.user_role`) that RLS reads. Services stay unit-testable against fake repositories.

---

## 2. Stack decision & rationale

| Decision | Choice | Why |
|---|---|---|
| Database | **PostgreSQL 15+** | Relational integrity + transactional guarantees for the ledger; native constraint enforcement of the "impossible transaction" rule; RLS for tenant isolation; JSONB where the data is genuinely sparse. |
| Backend | **FastAPI + SQLAlchemy 2.0 (async) + Alembic** | Async FastAPI for the API; SQLAlchemy 2.0 typed ORM; Alembic for versioned DDL migrations. Python keeps the Phase-2 Excel backfill parser (`openpyxl`/`pandas`) and the Excel export in **one codebase and one domain model** with the web service. |
| Numeric storage | **`NUMERIC`, canonical unit = KG** | Exact arithmetic; store KG, convert to MT only at presentation. Resolves the MT (ledger) vs KG (BBS/scrap) split in the source files. |
| Sparse per-dia data | **`JSONB` columns** on BBS/JMR where a row spans up-to-7 dia values, most empty | Document flexibility without a wide sparse table; GIN-indexable if needed. Fixed, always-present fields stay as real columns. |
| Frontend table | React + **MUI DataGrid** | Pinned columns, cell-level styling, CSV export built-in — matches the "must look like the Abstract they already produce" adoption requirement (PRD §2.1). |
| Tenant isolation | **RLS + session GUCs**, plus repository-level scoping as defense-in-depth | DB-enforced, so even a query bug can't leak another project's rows. |

---

## 3. Data model (PostgreSQL)

Two families: **shared masters** (company-wide, no `project_id`) and **project-scoped** (every table has `project_id`, RLS-protected). UUID PKs, `TIMESTAMPTZ`, `NUMERIC` weights. Append-only: corrections are new rows referencing `corrected_from_id`, never mutations.

**Date-column naming (standardized):** every transaction table uses **`effective_date`** for "the date this transaction actually happened" (gate-in date, issue date, count date, sale date) — not four different names for the same concept. An earlier draft had `grn.gate_timestamp`, `store_issue.event_date`, `physical_count.count_date`, `scrap_sale.sale_date`; that inconsistency made every Abstract query re-learn which column name applied to which table for no benefit. `grn` alone keeps a *second*, genuinely distinct column `gate_entry_at TIMESTAMPTZ` (the precise weighbridge timestamp, for audit/photo-evidence purposes) — `effective_date` is `gate_entry_at::date`, generated, so the monthly bucket is always consistent with the precise event.

### 3.1 Tables

| Table | Scope | Purpose |
|---|---|---|
| `vendors`, `contractors`, `dia_grades`, `rule_thresholds` | shared | masters; `rule_thresholds` holds per-rule mode+threshold, per-project overridable → **advisory↔blocking flips here, no deploy** |
| `projects`, `towers`, `floors`, `elements` | project | physical hierarchy (element_type: footing/column/shear_wall/slab/staircase/ramp/retaining_wall/beam/podium/misc) |
| `grn` | project | receipts; `receipt_type ∈ (against_po, other_site_sap, other_site_excel)`, `source_site` |
| `store_issue` | project | **issue to contractor — the core-bug fix**; `direction ∈ (out, in)` (in = "Return To MHC Store") |
| `store_issue_grn_link` | project | **join table** linking a `store_issue` to the specific `grn` batch(es) it drew from — real FK provenance, not an array |
| `inter_site_transfer` | project | inter-project loan/return; `from/to_project_id`, `flag`, `record_source` (SAP/Excel), HO approval, return dates |
| `inter_site_transfer_grn_link` | project | **join table** linking a transfer to the specific `grn` batch(es) it drew from — same provenance mechanism as store_issue |
| `bbs_plan` | project | planned bar-mark quantities; `dia_weights JSONB` for the sparse per-dia payload; `backfill_run_id` for idempotency |
| `jmr_actual` | project | measured "extra steel" (RA/JMS); same shape as bbs_plan + pour/drawing ref |
| `physical_count` | project | full-length + loose per (contractor, dia, date) |
| `physical_count_cut_piece` | project | **child of physical_count**; `classification` `NOT NULL CHECK (IN ('reusable','used_as_safety_steel','scrap'))` — DB rejects unclassified pieces |
| `scrap_sale` | project | scrap register (GP/DC/invoice/qty/rate/amount/GST/TCS) |
| `monthly_abstract_snapshot` | project | **immutable** finalized A–N (`sections JSONB`, `source_txn_hash`, `pipeline_version`, `status`) |
| `finalized_month` | project | month-lock rows; unique `(project_id, year, month)`; drives read-only enforcement |
| `users`, `project_assignments` | system | identity + tenant scope (source of truth for RLS) |
| `audit_log` | system | append-only; written in the **same transaction** as the ledger write; app DB role has no `DELETE` grant |
| `exception_log` | system | rules-engine output = persisted `RuleResult` |

### 3.2 The two tables that carry the whole design

**`store_issue` — the fix for the core bug (PRD §3.1):**
```sql
CREATE TABLE store_issue (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id),
    contractor_id     UUID NOT NULL REFERENCES contractors(id),
    dia_grade_id      UUID NOT NULL REFERENCES dia_grades(id),
    quantity_kg       NUMERIC(12,2) NOT NULL CHECK (quantity_kg > 0),
    direction         VARCHAR(3) NOT NULL CHECK (direction IN ('out','in')),  -- in = return to store
    issuing_staff     VARCHAR(255),
    effective_date    DATE NOT NULL,           -- standardized name, see date-naming note below
    corrected_from_id UUID REFERENCES store_issue(id),
    created_by        UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
In the current spreadsheet, Abstract **section D (Issued) = section C (Net Received) by formula** (confirmed identical at rows 15/17 of `Abstract (Newformat)`). Here, **D = `SUM(quantity_kg) FILTER (direction='out') − SUM(...) FILTER (direction='in')` per contractor+dia** — a genuine sum of issue rows. Issued ≠ received becomes *physically possible*, which is the entire point.

**Provenance — `store_issue_grn_link` (join table, not an array column):**
```sql
CREATE TABLE store_issue_grn_link (
    store_issue_id  UUID NOT NULL REFERENCES store_issue(id) ON DELETE CASCADE,
    grn_id          UUID NOT NULL REFERENCES grn(id),
    project_id      UUID NOT NULL REFERENCES projects(id),   -- denormalized for RLS
    PRIMARY KEY (store_issue_id, grn_id)
);
CREATE INDEX idx_sigl_grn ON store_issue_grn_link(grn_id);
```
An earlier draft of this plan used `linked_grn_ids UUID[]` on `store_issue`. **Corrected:** Postgres array columns cannot carry a `FOREIGN KEY` constraint on their elements, so nothing stopped a link pointing at a nonexistent or cross-project GRN — an unacceptable provenance gap in a financial ledger. The join table gets a real, DB-enforced FK. The same fix applies to `inter_site_transfer` via `inter_site_transfer_grn_link` (identical shape, `transfer_id` in place of `store_issue_id`) — the original plan omitted this link on transfers entirely; a transferred batch must be traceable back to the GRN it came from just like an issue.

**`physical_count_cut_piece` — closes the biggest leak (PRD §3.2), DB-enforced:**
```sql
CREATE TABLE physical_count_cut_piece (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    physical_count_id  UUID NOT NULL REFERENCES physical_count(id) ON DELETE CASCADE,
    project_id         UUID NOT NULL REFERENCES projects(id),   -- denormalized for RLS
    length_mm          INTEGER NOT NULL CHECK (length_mm >= 0),
    nos                INTEGER NOT NULL CHECK (nos >= 0),
    weight_kg          NUMERIC(12,2) NOT NULL CHECK (weight_kg >= 0),
    classification     VARCHAR(20) NOT NULL
                       CHECK (classification IN ('reusable','used_as_safety_steel','scrap')),
    -- app additionally enforces: length_mm <= 1500  =>  classification = 'scrap'
    CONSTRAINT scrap_rule CHECK (length_mm > 1500 OR classification = 'scrap')
);
```
`NOT NULL` + `CHECK` means a cut piece with no classification is rejected by the database — even from raw `psql`. The `scrap_rule` CHECK encodes the ≤1.5m ⇒ scrap domain rule at the DB level (Postgres *can* do this cross-field check, which Mongo's `$jsonSchema` could not).

Other type corrections applied throughout (from the DB review): `dia_grades.unit_weight_kg_per_m NUMERIC(6,4)`, `scrap_sale.total_amount NUMERIC(14,2) GENERATED ALWAYS AS (weight_kg*rate_per_kg) STORED`, `projects.contract_wastage_pct NUMERIC(5,2) DEFAULT 3.00`, all weights `NUMERIC(12,2) CHECK (> 0)`.

**`finalized_month` — DDL** (referenced in §5.5 but not previously specified). **Kept as a separate table from `monthly_abstract_snapshot` by design** — a month-lock is a distinct concern from a snapshot's content, and a re-opened-then-re-finalized month must produce a *new* snapshot version while the original is retained (§5.5), so a lock cannot be 1:1 with "the" snapshot. But the two need an **explicit FK**, not just a same-shaped natural key, so they can't silently drift apart:
```sql
CREATE TABLE finalized_month (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id),
    year                INTEGER NOT NULL,
    month               INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status              VARCHAR(10) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','reopened')),
    reason              TEXT,                    -- required (app-enforced) when status='reopened'
    current_snapshot_id UUID REFERENCES monthly_abstract_snapshot(id),  -- explicit link, not implied by key shape
    locked_by           UUID NOT NULL REFERENCES users(id),
    locked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, year, month)              -- a second finalize fails this constraint
);
```
On finalize: insert the `monthly_abstract_snapshot` row first, then insert/update `finalized_month.current_snapshot_id` to point at it, in the same transaction. On reopen+re-finalize: a *new* snapshot row is inserted (old one untouched) and `current_snapshot_id` is repointed — so `finalized_month.current_snapshot_id` always answers "which snapshot is authoritative right now," while `monthly_abstract_snapshot` retains full history.

**`element_progress` — DDL** (the `completion_pct` field flagged in §10 as needed but not yet written — resolved here, on an explicit table rather than bolted onto `bbs_plan`, since progress is tracked over time per element and a bar-mark row in `bbs_plan` shouldn't be mutated to carry it):
```sql
CREATE TABLE element_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id),
    element_id      UUID NOT NULL REFERENCES elements(id),
    as_of_date      DATE NOT NULL,
    completion_pct  NUMERIC(5,2) NOT NULL CHECK (completion_pct BETWEEN 0 AND 100),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (element_id, as_of_date)
);
```
Section F (WIP, §4) becomes `SUM(bbs_plan.planned_weight_kg × element_progress.completion_pct/100)` joined on `element_id`, using the latest `as_of_date` ≤ month-end per element — the same mechanism the legacy sheet uses (its observed `×50%` literal), now captured as real data instead of a hardcoded multiplier.

### 3.3 Row-Level Security (tenant isolation, DB-enforced)

RLS is enabled on every project-scoped table. The app sets two session GUCs per request (`app.current_user_id`, `app.user_role`); policies read them via helper functions:
```sql
CREATE FUNCTION accessible_project_ids() RETURNS SETOF UUID LANGUAGE SQL STABLE AS $$
  SELECT project_id FROM project_assignments
   WHERE user_id = current_setting('app.current_user_id')::UUID
  UNION
  SELECT id FROM projects WHERE current_setting('app.user_role') = 'admin'
$$;
CREATE FUNCTION can_access_project(p UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT p IN (SELECT accessible_project_ids()) $$;

ALTER TABLE store_issue ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel_store_issue ON store_issue FOR SELECT USING (can_access_project(project_id));
CREATE POLICY ins_store_issue ON store_issue FOR INSERT
  WITH CHECK (can_access_project(project_id)
              AND created_by = current_setting('app.current_user_id')::UUID);
-- …repeated per table (generated via a DO-loop over the table list)…
-- audit_log: SELECT scoped by project; NO delete policy for any non-admin role.
```
Cross-posting between projects (PRD §4.5 story 21) is **structurally impossible at the DB layer**, not just filtered in the app. The repository layer's scoping is defense-in-depth on top.

**Critical operational requirement, discovered during Foundation verification (2026-07): the app's runtime DB connection MUST NOT be a Postgres superuser or table owner.** PostgreSQL superusers and table owners **bypass Row-Level Security entirely** (`rolbypassrls`) — this is documented Postgres behavior, but easy to miss, and the `POSTGRES_USER` a `docker-compose` Postgres image provisions is *always* a superuser. Testing live: connecting as that superuser, a QS assigned to only one project could `SELECT` **and `INSERT`** into a second project with zero RLS errors — every policy in this section was a silent no-op. The fix is a dedicated, restricted application role (`steel_recon_app`) created by its own migration, granted only `SELECT/INSERT/UPDATE` (no `DELETE`, matching the append-only design) — the app connects as this role; Alembic migrations continue to run as the superuser/owner, since DDL is an operator action, not a tenant-scoped one. **Verified after the fix:** the same QS, connected as the restricted role, saw exactly their own project, got zero rows querying another project by its known UUID directly, and got a hard `ERROR: new row violates row-level security policy` attempting to insert into it. This must be carried into every environment (local, CI, staging, production) — a staging environment accidentally using the DB owner role would silently defeat every tenant-isolation guarantee in this document.

### 3.4 Indexing strategy

Hot path = "one project's month, sliced by dia." Composite index order = **equality → range → dia**. Key indexes (from the DB review, **corrected during implementation** — see note below):
```sql
-- Monthly aggregation (Abstract) — covers the primary hot queries.
-- Every table uses the same effective_date column name, so this index shape repeats identically:
CREATE INDEX idx_grn_agg ON grn(project_id, effective_date, dia_grade_id)
    INCLUDE (weighbridge_weight_kg);
CREATE INDEX idx_si_agg  ON store_issue(project_id, effective_date, dia_grade_id)
    INCLUDE (quantity_kg);
CREATE INDEX idx_pc_agg  ON physical_count(project_id, effective_date, dia_grade_id);
CREATE INDEX idx_ss_agg  ON scrap_sale(project_id, effective_date) INCLUDE (weight_kg);

-- The issue>stock invariant read:
CREATE INDEX idx_grn_stock ON grn(project_id, dia_grade_id) INCLUDE (weighbridge_weight_kg);
CREATE INDEX idx_si_stock  ON store_issue(project_id, dia_grade_id) INCLUDE (quantity_kg);

-- FK indexes (Postgres does NOT auto-create these) on every *_id column;
-- partial correction-chain indexes: WHERE corrected_from_id IS NOT NULL.
```
**Corrected during implementation (2026-07):** the original draft indexed `date_trunc('month', effective_date)` directly, copied from the OpenCode database-review output without being run against a real Postgres. This fails outright — `CREATE INDEX ... : functions in index expression must be marked IMMUTABLE`, because `date_trunc(text, timestamp)` is `STABLE` (its result depends on the session's timezone), not `IMMUTABLE`, so Postgres rejects it as an index expression. Indexing the plain `effective_date` column instead serves identical monthly range-scan queries (`WHERE effective_date >= :month_start AND effective_date < :month_end`) via a standard B-tree range scan — same performance, no functional-index requirement. **Lesson: a plausible-looking DDL snippet from a review is not verified until it actually runs against a real database** — this bug was invisible in three rounds of document review and only surfaced when the Foundation migration was applied to a live Postgres container.
NFR is <2s dashboard over ≤12 months (PRD §8); these make each section an index scan over one month's slice. If the Abstract query gets heavy at scale, promote it to a **materialized view** refreshed on write (the DB review's escalation path) — but start with plain indexed queries; measure first.

### 3.5 Upstream document capture (added 2026-07 — the GRN's validation anchors)

These entities sit **before** the GRN in the chain (§0.5) and make the GRN a *reconciled* number instead of a *trusted* one. They are **purely additive**: new project-scoped, RLS-protected, append-only tables plus a few **nullable** FK/columns on the existing `grn` table. Nothing downstream of the GRN references these, so the 8 existing transaction tables, the invariant, and the A–N queries are untouched. Every new entity is optional at entry time — a site whose real flow lacks one of these documents (see §0.5 point 3) can still record a GRN; the corresponding validation check simply reports "no anchor to reconcile against" rather than blocking.

| Table | Scope | Purpose |
|---|---|---|
| `purchase_order` | project | one PO header per order: `po_number`, `vendor_id`, `order_date`, `status ∈ (open,partial,closed,cancelled)` |
| `purchase_order_line` | project | per-dia ordered qty + rate: `po_id`, `dia_grade_id`, `ordered_qty_kg NUMERIC(12,2)`, `rate_per_kg NUMERIC(12,4)` |
| `supplier_invoice` | project | invoice header: `invoice_number`, `vendor_id`, `po_id` (nullable FK), `invoice_date`, `eway_bill_number`, `vehicle_number` |
| `supplier_invoice_line` | project | per-dia invoiced qty + rate: `invoice_id`, `dia_grade_id`, `invoiced_qty_kg`, `rate_per_kg` |
| `quality_check` | project | acceptance record, child of `grn`: `grn_id`, `mtc_number`, `grade`, `accepted_qty_kg`, `rejected_qty_kg`, `remarks` |

**`grn` extension (all nullable — additive, no data migration needed on existing rows):**
```sql
ALTER TABLE grn ADD COLUMN po_id                UUID REFERENCES purchase_order(id);
ALTER TABLE grn ADD COLUMN supplier_invoice_id  UUID REFERENCES supplier_invoice(id);
ALTER TABLE grn ADD COLUMN gross_weight_kg      NUMERIC(12,2);   -- weighbridge loaded-in
ALTER TABLE grn ADD COLUMN tare_weight_kg       NUMERIC(12,2);   -- weighbridge empty-out
-- existing weighbridge_weight_kg remains the accepted net; gross - tare should reconcile to it.
```
The weighbridge slip is captured as `gross`/`tare` on the GRN itself rather than a separate table — it is 1:1 with a receipt and has no independent life-cycle. The gate-inward register and MTC are represented by fields (`vehicle_number` on the invoice, `mtc_number` on `quality_check`) rather than their own tables until a site's flow shows they need to be first-class; this follows the "living catalogue" principle (§0.5 point 3).

**Inbound-reconciliation check (new, advisory-first like every other rule):** on GRN entry the service compares, per dia, `invoiced_qty_kg ↔ (gross − tare) ↔ weighbridge_weight_kg (accepted)` and `Σ grn.accepted per po_line ≤ ordered_qty_kg (+ tolerance)`. Deviations beyond a `rule_thresholds` band become `exception_log` rows. This is a `batch`/`transactional` rule in the existing engine (§5.2) — `applies_to = "grn"` — not new machinery. It stays **advisory** until a site confirms its documents are complete enough to promote it to blocking, exactly as with `issue_exceeds_stock`.

**Trust-tier note carried into the schema:** `purchase_order`, `supplier_invoice`, and the weighbridge net are **Tier-1** anchors (§0.5); the GRN's `weighbridge_weight_kg` was already the accepted-net Tier-1 measurement and remains section A's source (§4). The additions let the tool *prove* that net against the invoice and PO, rather than accept it on faith.

---

## 4. The Abstract — sections A–N as SQL (never stored)

Grounded in the real `Abstract (Newformat)` sheet. Dia columns 8/10/12/16/20/25/32, presented in MT. `AbstractService` composes one repository query per source table, then assembles sections by formula.

| § | Section | Source & formula |
|---|---|---|
| A | Received | `grn` grouped by dia × receipt_type (against PO / other-site SAP / other-site Excel) |
| B | Transferred (out) | `inter_site_transfer` (flag=loan) by dia × record_source (SAP/Excel) |
| **C** | **Net Received** | **A − B** |
| **D** | **Issued to contractor** | **`store_issue`: SUM(out) − SUM(in), per contractor+dia** ← the bug fix; no longer `= C` |
| E | Consumption | **Traced to actual formulas** (not guessed): `Σ` per-tower pour rows (Raft/Footings/RF2/JMR/Columns/Grade Slab/Core Walls/Slab&Beams…) sourced from each tower's own external "STEEL ABSTRACT" workbook, `/1000` unit conversion, **+ a real "Other Works" bucket** (Labour Colony Sheds, STP — sourced from its own Misc Qty Backup sheet), grouped by contractor. Maps directly onto `bbs_plan`/`jmr_actual` rows already in the schema — `contractors` must include an `other_works` row, it is not synthetic. |
| F | WIP | **Traced to actual formulas**: a parallel row block, same per-tower/per-pour shape as E, but each row is `plannedWeight × completionFraction` (observed literal `× 50%` in the source) for elements not yet fully poured. WIP = `Σ bbs_plan.planned_weight_kg × completion_pct` per in-progress element — `completion_pct` must be captured at BBS/JMR entry time, not derived. |
| G | Consumption + WIP | E + F |
| H | Theoretical stock | C − G |
| I | Physical full-length | **latest** `physical_count` per contractor+dia: `bundles×bundle_wt + loose×rod_wt` |
| J | Physical cut pieces | latest count: pieces where classification ∈ {reusable, used_as_safety_steel} = **stock**; scrap excluded |
| K | Total physical | I + J |
| L | Wastage qty | H − K |
| M | Wastage % | **As literally defined in the file: `M = K/G`** (physical stock ÷ consumption+WIP — note this divides stock by consumption, the reverse of the intuitive "wastage/consumption"; confirm this is intentional, not a legacy mislabeling, before hard-coding it) — real file value = 4.97%, already over the 3% cap |
| N | Scrap sold | `scrap_sale` totals |

**Section E/F source shape** (from tracing `Recon.Steel-KLC Qty Backup` rows 9–1338 in the real file): each tower is a contiguous row block per contractor (Tower-1 = one block, Tower-2 = the next, etc.), and each row within a block is one structural pour (Raft, Footings, Columns, Grade Slab, Slab & Beams, JMR…) pulled from that tower's own external per-tower "STEEL ABSTRACT" workbook. **This is exactly the `bbs_plan`/`jmr_actual` schema already in §3** — the backfill parser (Phase 2, §7.2 families) must treat "per-tower STEEL ABSTRACT workbook" as one of its file families, and WIP rows carry an explicit `completion_pct` (e.g. 50%) that must become a captured field on the relevant transaction, not something inferred.

**Section D (the corrected computation) in SQL:**
```sql
SELECT dg.diameter_mm AS dia, si.contractor_id,
       SUM(si.quantity_kg) FILTER (WHERE si.direction='out')
     - SUM(si.quantity_kg) FILTER (WHERE si.direction='in')  AS net_issued_kg
FROM store_issue si JOIN dia_grades dg ON dg.id = si.dia_grade_id
WHERE si.project_id = :pid
  AND si.effective_date >= :month_start AND si.effective_date < :month_end  -- sargable range, uses idx_si_agg
GROUP BY dg.diameter_mm, si.contractor_id;
```
(`:month_start`/`:month_end` computed in the service, not `date_trunc(...) = :month` — wrapping the indexed column in a function prevents the planner from using `idx_si_agg`'s range scan, per the indexing note in §3.4.)

**Sections I/J (physical = *latest* count per contractor+dia, not a sum):**
```sql
WITH latest AS (
  SELECT DISTINCT ON (contractor_id, dia_grade_id) *
  FROM physical_count
  WHERE project_id = :pid AND effective_date <= :month_end
  ORDER BY contractor_id, dia_grade_id, effective_date DESC
)
SELECT ... -- full-length: bundles*bundle_wt + loose*rod_wt  (Section I)
       ... -- cut pieces JOIN physical_count_cut_piece, split by classification (Section J)
FROM latest ...;
```

**BBS-planned vs JMR-actual side-by-side** (PRD story #13, rules §6 row 7) is a SQL join of `bbs_plan` to `jmr_actual` on (tower, floor, dia) — the two systems that "only meet in the QS's head" now meet in a query.

**Snapshot:** on finalize, the service runs all section queries, assembles A–N, and writes them into `monthly_abstract_snapshot.sections (JSONB)` with `source_txn_hash` + `pipeline_version`. **That is the only time a summary is persisted.**

---

## 5. Backend structure & key mechanisms

### 5.1 Directory tree (FastAPI + SQLAlchemy + Alembic)
```
backend/
  alembic/versions/            # real DDL migrations (0001_schema, 0002_rls, 0003_indexes, …)
  app/
    main.py  config.py  database.py  dependencies.py  exceptions.py  error_handlers.py
    models/        # SQLAlchemy 2.0 mapped classes
      base.py      # Base, TimestampMixin, TenantMixin(project_id)
      masters.py  project.py  transactions.py  system.py
    schemas/       # Pydantic request/response — INPUT VALIDATION ONLY
    repositories/  # ONLY layer touching SQLAlchemy; sets session GUCs for RLS
      base.py                 # BaseRepository (scoped session, GUC setter)
      stock_repository.py     # available = SUM(grn) - SUM(issue) per contractor+dia (locked)
      abstract_repository.py  # ALL A–N section queries
      <entity>_repository.py …
    services/      # ONE per transaction type (write orchestration + DB txn)
      base_service.py  grn_service.py  store_issue_service.py (the invariant) …
      abstract_service.py     # READ-MODEL — never mutates
      month_close_service.py  # finalize + snapshot + finalized_month lock; reopen w/ reason
      audit_service.py        # audit context manager -> audit_log rows (same txn)
    rules/         # BUSINESS RULES (separate from input validation)
      engine.py  base.py  registry.py
      transactional/  # issue_exceeds_stock, cut_piece_classification, bundle_weight_variance,
                      #   sequencing, chair_spacer_deviation
      batch/          # wastage_trend, bbs_vs_issue
    export/        # Excel package — ONE module per section + golden template .xlsx
    tasks/         # scheduler + nightly_rules + integrity job
    routers/       # THIN HTTP adapters
  parser/          # Phase-2 backfill: one parser per file family + idempotent report
  tests/           # unit (rules; services vs fake repos) / integration (testcontainers-pg) / regression (Excel golden)
```

### 5.2 Rules engine (DB-agnostic — unchanged from the strong original design)
`BaseRule(ABC).evaluate(ctx) -> RuleResult`; `RulesEngine.register()/evaluate()`; `RuleMode ∈ {ADVISORY, BLOCKING}`; `RuleContext` carries **pre-fetched** `derived`/`thresholds` so rules are pure and unit-testable with plain dicts. A failed `RuleResult` *is* the `exception_log` row. One class per PRD §6 rule. The **service** — not the engine — decides what to do with results (persist advisories, raise on blocking).

**Dispatch mechanism (resolved — the engine owns applicability, not the caller):** each `BaseRule` declares a class attribute `applies_to: str` (e.g. `"store_issue"`, `"physical_count"`). `RulesEngine.register(rule)` files it under that key. A service calls `engine.evaluate(ctx)` where `ctx.transaction_type` is fixed per service (`store_issue_service` always passes `"store_issue"`); the engine internally filters to the rules registered for that type and runs only those. This keeps services ignorant of which rules exist — adding a new rule is "write the class + register it," never a change to any service. `registry.py` (in `rules/`, §5.1) is the single composition root that instantiates and registers every rule at app startup.

**Schema evolution on live data (brief, per DB-review — not a structural risk, standard practice):** Alembic migrations that add a nullable column or a new table are zero-downtime. Adding a `NOT NULL` column to a table with live rows follows the standard three-step pattern — add nullable → backfill via a data migration → add the `NOT NULL`/`CHECK` constraint in a follow-up migration — never a single-step breaking change. Because every transaction table is append-only with `corrected_from_id`, a schema change never needs to rewrite historical rows' meaning, only add new optional context to future ones.

### 5.3 The invariant — `store_issue` transactional write path

**Resolved (confirmed directly with a My Home store manager, 2026-07):** GRN/PO are **never** raised against a specific contractor. Steel is received into one shared store pool per project; the store keeper then *chooses* how much to distribute to each contractor, keeping a buffer that may itself flow to other sites via `inter_site_transfer`. **"Available stock" is therefore per-project + per-dia only — never per-contractor.** `grn` correctly has no `contractor_id` (§3.2); the invariant check does **not** group by contractor:

```sql
-- available(project, dia) = store-wide receipts - store-wide issues out + issues returned in
--                            - transfers out + transfers in   (all at the dia grain, no contractor split)
SELECT
    COALESCE((SELECT SUM(weighbridge_weight_kg) FROM grn
              WHERE project_id = :pid AND dia_grade_id = :dia), 0)
  - COALESCE((SELECT SUM(quantity_kg) FILTER (WHERE direction='out')
                    - SUM(quantity_kg) FILTER (WHERE direction='in')
              FROM store_issue WHERE project_id = :pid AND dia_grade_id = :dia), 0)
  - COALESCE((SELECT SUM(quantity_kg) FILTER (WHERE flag='loan' AND from_project_id = :pid)
                    - SUM(quantity_kg) FILTER (WHERE flag='return' AND to_project_id = :pid)
              FROM inter_site_transfer WHERE dia_grade_id = :dia), 0)
  AS available_kg;
```

Postgres lets us enforce this properly, with a real lock to serialize the check-and-insert:
```python
async def create(self, payload):
    if await self._locks.is_finalized(payload.project_id, payload.period):   # 1. month lock
        raise MonthLocked(payload.period)                                    #    (409)
    async with self._uow.transaction() as session:                          # 2. one DB txn
        # 3. serialize the check per (project, dia) — NOT per contractor, since stock is a
        #    shared pool; concurrent issues of the same dia can't race the read.
        #    pg_advisory_xact_lock auto-releases at commit.
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
            {"k": f"{pid}:{dia}"})
        available = await self._stock.available_qty(pid, dia, session)      # store-wide, see SQL above
        ctx = RuleContext(..., derived={"available_qty": available})
        results = await self._engine.evaluate(ctx)                          # 4. run rules
        if RulesEngine.blocking_failures(results):                          # 5. blocking (Phase 3)
            raise BlockingRuleViolation(...)                                #    -> txn rolls back (422)
        row = await self._issues.insert(payload, session)                   # 6. issue + advisories
        await self._persist_advisories(results, row.id, session)            #    + audit, ALL one txn
        await self._audit.record("CREATE", "store_issue", row, session)
    # commit on context exit; ANY raise rolls back atomically
    return StoreIssueResponse.model_validate(row)
```
The advisory lock + single transaction make the check-and-insert atomic and race-free (stronger than the Mongo equivalent, and cheaper than table locks). Advisory↔blocking is a `rule_thresholds` config flip — no deploy (PRD §6 "promote after 2 clean cycles"). **Optional belt-and-braces:** when promoted to blocking, add a `CONSTRAINT TRIGGER` that re-checks non-negativity on commit — a pure-DB backstop the app can't bypass.

### 5.4 Tenant isolation (two enforced layers)
1. **`verify_project_access` FastAPI dependency** resolves the project from the JWT via `project_assignments` (never from body/query) and returns the one project the QS is assigned to.
2. **RLS at the DB** (§3.3): the repository sets `app.current_user_id`/`app.user_role` on the session; policies restrict every row. Even a mis-written query cannot return another project's data.

**Standing router rule, caught live during Phase 1b:** no QS-scoped route may declare `project_id` as a path/body/query parameter — ever, even to "validate it matches." An early draft of the towers router used `POST /projects/{project_id}/towers` with `project_id: uuid.UUID` taken from the URL instead of `ProjectScope`; a probe with a forged `project_id` in the URL was rejected, but *only* because layer 2 (RLS) caught the cross-project write at the database — layer 1 (the route itself) had the exact anti-pattern this section warns against. The fix was not to add validation, but to remove the parameter entirely: `POST /towers` with `project_id: ProjectScope` as the only source of tenant scope, matching the `/projects/me` pattern. **Every subsequent project-scoped route must follow this shape** — RLS being a working safety net doesn't excuse the app layer from getting it right; the two are meant to be independent guarantees, not one compensating for the other by design.

### 5.5 Month-end finalize (real DB primitives)
`finalize(period)` in one transaction: insert a `finalized_month` row (unique `(project_id, year, month)` → a second finalize fails the constraint) → compute the full Abstract → insert immutable `monthly_abstract_snapshot` → audit. **Read-only enforcement:** every write service calls `is_finalized(period)` as step 1 (§5.3); optionally a `BEFORE INSERT/UPDATE` trigger on each ledger table rejects rows whose event date falls in a finalized month — a DB-level lock the app can't bypass. **Re-open** (PRD §4.4 story 20) requires a non-empty `reason`, flips `finalized_month.status='reopened'`, appends to an audit trail, and never deletes the original snapshot (re-finalize creates a new snapshot version).

---

## 6. API surface (`/api/v1`, JWT bearer)

- **Auth:** `POST /auth/login`, `GET /auth/me` (returns user + assigned project → frontend lands directly on that project's dashboard, PRD §4.5 story 22).
- **Transactions (CRUD per type):** `grn`, `store-issues`, `inter-site-transfers`, `bbs-plans` (+`/bulk`), `jmr-actuals` (+`/bulk`), `physical-counts`, `scrap-sales`. "Delete" = append a correction/reversal row, never a hard delete.
- **Abstract (read-only):** `GET /abstract?period=YYYY-MM` (live), `GET /abstract/export?format=xlsx|pdf`, `POST /month-close/finalize`, `POST /month-close/reopen`, `GET /abstract/history`.
- **Dashboard:** `GET /dashboard/summary`, `/dashboard/wastage-trend`, `/dashboard/recent`.
- **Exceptions (Phase 2):** `GET /exceptions`, `POST /exceptions/{id}/resolve` (approve-as-is + reason / correct / follow-up).
- **Errors:** ECC envelope `{"error":{"code","message","details"}}`; 422 blocking rule violation, 409 month-locked, 403 tenant mismatch.

---

## 7. Frontend structure

> **STACK REVISION (2026-07, supersedes the MUI references below):** the frontend is built with **Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui** (components vendored into `src/components/ui/`, themed via CSS variables from the brand-anchored `frontend/design-tokens.json`; react-bits/21st registries available for drop-in components). Rationale: the user's chosen component ecosystem (shadcn/21st/react-bits/Stitch) is Tailwind-native, and the premium bar is best hit there; the data-grid needs are covered by a purpose-built Abstract grid + a lightweight `DataTable` (TanStack-grade grid can be dropped in from 21st if list volumes demand it). The *structure* below (pages, per-page behavior contract, two-tier error model, no-typed-summary AbstractGrid) remains authoritative — only the component library changed. Built structure lives in `frontend/src/` (`lib/` api+auth+types+queries, `components/app/` primitives, `components/layout/` shell, `pages/`). Dev connection = Vite proxy `/api` → `:8000` (no CORS changes to the backend).

```
frontend/src/
  api/
    client.ts              # axios instance, JWT interceptor, 401->redirect to login
    endpoints/              # grn.ts, storeIssue.ts, interSiteTransfer.ts, bbsPlan.ts, jmrActual.ts,
                            #   physicalCount.ts, scrapSale.ts, abstract.ts, exceptions.ts, monthClose.ts
  types/                   # generated from OpenAPI (one .ts per resource, mirrors backend schemas)
  components/
    AbstractGrid/          # AbstractGrid.tsx (dia cols 8..32 + Total, rows A-N)
                           # SectionRow.tsx (one row; wastage row conditionally red if >3% cap)
                           # AbstractSummaryBar.tsx (month picker, finalize/reopen buttons, export menu)
    DataTable/             # thin MUI DataGrid wrapper: pagination, sort, empty-state, loading skeleton
    EntryForm/             # shared form scaffold: react-hook-form + zod; renders field-level errors
                           # AND a top-of-form banner for blocking-rule 422 responses (PRD story 17 —
                           # "clear error message explaining exactly which constraint failed")
    PhotoUpload/           # weighbridge/count-slip upload widget, 5MB/jpeg-png client-side pre-check
    ConfirmDialog.tsx  EmptyState.tsx  LoadingSpinner.tsx
  pages/
    LoginPage.tsx
    DashboardPage.tsx       # KPI cards, wastage gauge, recent-transactions list
    AbstractPage.tsx        # hosts AbstractGrid + history + export
    transactions/
      GrnListPage.tsx  GrnNewPage.tsx
      StoreIssueListPage.tsx  StoreIssueNewPage.tsx
      InterSiteTransferListPage.tsx  InterSiteTransferNewPage.tsx
      BbsListPage.tsx  BbsNewPage.tsx
      JmrListPage.tsx  JmrNewPage.tsx
      PhysicalCountListPage.tsx  PhysicalCountNewPage.tsx    # cut-piece rows + classification required
      ScrapSaleListPage.tsx  ScrapSaleNewPage.tsx
    ExceptionsInboxPage.tsx  # Phase 2: list + resolve (approve-as-is/correct/follow-up)
    NotFoundPage.tsx
  hooks/  useAuth.ts  useProject.ts  useAbstract.ts  useExceptions.ts  useDashboardData.ts
  router.tsx               # RequireAuth wrapper; QS lands directly on DashboardPage (PRD story 22)
  App.tsx  main.tsx
```

**Per-page behavior contract** (every list/form page follows this, so it's specified once, not per-page):
- **List pages**: loading skeleton → populated `DataTable` → explicit `EmptyState` (not a blank table) when zero rows; server-side pagination; a persistent "+ New" button.
- **Form pages** (new/edit): field-level validation errors inline (Pydantic 422 → per-field messages via a shared error-mapping util); a page-level banner for blocking rule violations distinct from field errors; disabled submit + spinner during the request; success → toast + redirect to list.
- **`PhysicalCountNewPage`**: cut-piece rows are a repeatable field array; `classification` is a required `<Select>` per row the moment `nos > 0` — this is the client-side mirror of the DB `CHECK` in §3.2, not the enforcement itself.
- **`AbstractGrid`**: read-only; cells are not editable (the invariant — no summary is ever typed); each section row shows its formula on hover (e.g. "D = Σ store_issue.out − Σ store_issue.in") so the QS can audit *why* a number is what it is, addressing the "must look like the Abstract they trust" adoption risk (PRD §2.1) with traceability, not just visual similarity.
- **`monthClose`**: `AbstractSummaryBar`'s Finalize button opens a `ConfirmDialog` naming the exact period; Reopen requires a non-empty reason field (PRD story 20) before the request is even sent.

`PhysicalCount` form requires cut-piece `classification` when a cut count > 0 (client-side UX mirror; the DB `CHECK` is the real guard).

---

## 8. Testing strategy

Follows the PRD §11 seam guidance (test at the ingestion API and the reporting layer):

| Layer | Test type | Double |
|---|---|---|
| Rules (`rules/*`) | Unit | Pure `RuleContext` dicts, no DB. Pass/fail fixture per rule. |
| Services (`services/*`) | Unit | **Fake in-memory repositories.** Assert orchestration: blocking → raises + zero writes; advisory → writes exception_log. |
| Repositories (`repositories/*`) | Integration | **testcontainers-postgres**, one per entity. Real SQL, RLS scoping verified, and store_issue txn **rolls back on `BlockingRuleViolation`**. |
| Write paths | Integration | Full router→service→repo→PG; rules fire + audit written in same txn; RLS blocks cross-project access. |
| Excel export | Regression/snapshot | One real month per project → export → compare **cell-for-cell against golden `.xlsx`** (PRD §11.2). |
| Parser (`parser/*`) | Unit | 3–5 real files per family, expected row counts (PRD §11.2). |

Use **testcontainers-postgres** for integration (RLS, constraints, and the aggregation SQL all need a real Postgres — SQLite can't stand in). **Acceptance gate (PRD §11.3):** computed A–N reproduces one real month per project within **<0.1% variance per section** vs the manual Excel, and **zero issue>stock accepted in blocking mode.**

---

## 9. Build order (mapped to PRD phases)

Critical path = **`AbstractService` section queries + Excel export** — highest domain risk, gates the Phase-1 exit criterion. Start export-template digitization on day one (needs the Phase-0 signed-off layout).

**Near-term deliverable (2026-07 reframing, §0.5):** the first shippable thing is a **manual data-entry tool with validation** — the transaction-entry UIs + the validation matrix + the historical back-test — not the full analytics surface. The build order below already produces this: Foundation → Data layer → Transaction entry (now including **Upstream capture**) → Abstract → back-test. Upstream capture (§3.5) is inserted as a step *within* Transaction entry; every phase after it keeps its original content and simply follows it. Nothing is removed or rewritten.

**Foundation (serial):** scaffold FastAPI + Postgres (docker-compose + testcontainers) → SQLAlchemy models + `0001` schema migration → auth + users + project_assignments + `verify_project_access` → `0002` RLS policies + session-GUC wiring → `BaseRepository` + exceptions + error handlers → `0003` indexes.

**Data layer (parallel after base):** Track A: models + repositories per entity. **Track B (critical): `abstract_repository` A–N queries — start early.** **Track C (critical): Excel template digitization from the signed-off layout.**

**Transaction entry:** `grn_service` first (no rules) → `store_issue_service` (**the transactional invariant + advisory lock**) → audit wired into every service → input schemas + thin routers + frontend forms. `cut_piece_classification` ships here (DB `CHECK` + form validation).

**Upstream capture (added 2026-07, §3.5 — slots in right after `grn_service`):** migration adds `purchase_order`(_line), `supplier_invoice`(_line), `quality_check` + the nullable `grn` columns → repositories + services + thin routers + frontend forms for PO / invoice / weighbridge / QC → the **inbound-reconciliation rule** (`applies_to="grn"`, advisory) wired into the existing engine. Because every field is nullable and the rule is advisory, this ships without disturbing the already-verified GRN/issue path — a GRN with no linked PO still saves; it just carries an "unreconciled" advisory. This is the concrete work that moves the tool boundary upstream of the GRN.

**Abstract / Dashboard (critical path converges):** `AbstractService.compute` → `/abstract` → `AbstractGrid`; Excel export wired + golden-file regression test. **→ Phase-1 exit: reproduce one real month per project, verified vs manual Excel.**

**Rules + backfill (Phase 2, parallel — but see the note below):** `RulesEngine` + transactional rules (advisory) + exceptions inbox UI; batch rules (`wastage_trend`, `bbs_vs_issue`) + nightly scheduler; `parser/` families + idempotent backfill report. **→ Phase-2 exit: exceptions inbox usable; ≥90% backfill row-load.**

**Backfill capability is pulled earlier for any non-greenfield project (see §0):** a *minimal* import path (even a one-off SQL/CSV loader, not the full 5-parser-family tool) for GRN/store-issue/physical-count history must exist before that project's Abstract is trusted, because the Abstract is cumulative from project start with no opening-balance concept. For APAS specifically, this means loading history is a Phase-1 blocker, not a Phase-2 nice-to-have — the full polished parser tooling can still land in Phase 2.

**Hardening (Phase 3):** finalize/snapshot/month-lock + reopen-with-reason; promote `issue_exceeds_stock` advisory→blocking via `rule_thresholds` (+ optional constraint trigger) after 2 clean cycles; perf pass to NFR p95 targets (materialized view if needed); index tuning on real volume.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Per-tower external "STEEL ABSTRACT" workbooks (the real source of E/F) are **separate linked files, not present in this dataset** | Request the actual per-tower workbooks (`[197] STEEL ABSTRACT T1`, `[199] STEEL ABSTRACT`, etc.) before building the Phase-2 parser family for them — they are external links in the master file, currently unresolved without the source files. |
| **Resolved:** WIP `completion_pct` (observed as a literal `×50%` in the source) had no field anywhere in the v1 schema | Added the `element_progress` table (§3.2) — WIP is computed from real captured data, matching the legacy sheet's mechanism. |
| Broken external link for "MH Stock at Site" (`'[196]28-05-2025'!N17`, stubbed at 0 in every dia) | One-line confirmation with the QS: is My Home's own on-site stock genuinely negligible, or is this a real gap in their current process we're inheriting? Doesn't block schema/build. |
| **`M = K/G`** (their wastage% divides physical stock by consumption, not the more intuitive wastage÷consumption) | One-line sanity check with the QS before hard-coding the formula — confirm intentional, not a legacy mislabel. |
| **Resolved:** stock allocation is store-level, not per-contractor (confirmed with My Home store management, 2026-07) | `store_issue.contractor_id` records *who received* it; the invariant check (§5.3) is per-project+dia, no contractor grouping. No open item remains. |
| **Resolved (from OpenCode review):** `linked_grn_ids UUID[]` had no DB-enforced referential integrity | Replaced with `store_issue_grn_link` / `inter_site_transfer_grn_link` join tables with real FKs (§3.2). |
| **Resolved:** 4 different date-column names across transaction tables (`gate_timestamp`/`event_date`/`count_date`/`sale_date`) | Standardized to `effective_date` everywhere (§3.1); `grn` additionally keeps `gate_entry_at` for the precise weighbridge timestamp. |
| **Resolved:** `finalized_month` and `monthly_abstract_snapshot` had no explicit link | Added `finalized_month.current_snapshot_id` FK (§3.2); snapshot history is retained across reopen/re-finalize. |
| **Resolved:** rule-dispatch mechanism (which rules run for which transaction type) was unspecified | `BaseRule.applies_to` + `RulesEngine.register()` filtering, composed once in `rules/registry.py` (§5.2). |
| **Onboarding a mid-construction project with no opening-balance concept** | A minimal history-import path must exist before Phase-1 exit for any non-greenfield project (see §0, §9) — not deferred to the full Phase-2 parser tooling. |
| Excel export column-for-column fidelity has no concrete library/approach chosen yet | Decide `openpyxl` (load the real template, write into existing merged cells/styles) vs `xlsxwriter` (build from scratch) during Track C (§9) — recommend `openpyxl` on the real template, since it preserves the exact existing formatting the QS already trusts, per PRD §10. |
| Abstract doesn't match the Excel to <0.1% | Build `abstract_service` section-by-section against the real Steel Recon file as ground truth; golden-file regression test pins it; `pipeline_version` on snapshots. |
| Cut-piece blocking rule rejects valid entries | Advisory for week 1 of pilot, then flip to blocking via `rule_thresholds` once the QS confirms the 3 classes cover real cases. |
| Float drift / mixed units (already in source files) | `NUMERIC` everywhere, canonical KG, MT at presentation; reject `#REF!`/non-numeric at parse time (backfill rejection report). |
| Audit not written with the ledger row | Single unit-of-work transaction always co-writes the audit row; unit test asserts a mid-write error leaves zero rows. |
| QS batches entry monthly (reproduces the old problem) | Weekly cadence an explicit pilot practice; time-to-visibility measured as a KPI from day one. |
| `audit_log` growth at scale | Index `(project_id, created_at DESC)`; partition by month if volume warrants (Phase 5 concern). |

---

## 11. Open decisions to close before build

Sections E–N's *formulas* are already fully traced from the real workbook (§4), and the stock-allocation model is now resolved (§5.3). What remains:

1. **Obtain the per-tower "STEEL ABSTRACT" external workbooks** (T1, T2, … — currently only linked, not in hand) — these are the actual source of consumption/WIP detail and must become a parser family (pulled into Phase 1 for APAS, per §0/§9's onboarding note).
2. Confirm **`M = K/G`** is intentional (physical stock ÷ consumption, not wastage ÷ consumption) before hard-coding it.
3. Confirm the **"MH Stock at Site" gap** (broken external link, stubbed at 0) is genuinely negligible or a real process hole to inherit/fix.
4. **Decide the minimal history-import mechanism** for Phase 1 (full parser vs one-off SQL/CSV loader) — needed because APAS is mid-construction, not greenfield (§0).
5. Sign-off on the **A–N Abstract layout** with the QS (Phase-0 exit) — the input to the Excel golden template.
6. Choose the **Excel export library** (recommend `openpyxl` on the real template — §10).
7. Hosting/region (which managed Postgres — RDS/Cloud SQL/Azure/Aurora) and timeline for the cloud move.
8. Auth: local password policy vs company SSO.
9. Central vendor/contractor master source, or does this app own it from day one?
10. Exact Phase-1 variance tolerance (0.1% draft, or tighter?) and the baseline "time to close a month" (for the 50%-reduction KPI).
11. **Which site/tower is the back-test benchmark?** (§0.5, `PROCESS_AND_VALIDATION.md` §8) — APAS is the default, but a site with cleaner month-end docs would be a stronger proof of savings.
12. ~~Build upstream capture (§3.5) now, or keep GRN trusted for the first back-test and add upstream in a follow-up?~~ **Resolved (2026-07):** built now — see §13. Migration `0005` + the `inbound_reconciliation` rule are live; GRN is still trusted *only* for the frozen historical back-test, validated upstream for everything going forward.

**Resolved:** stock-allocation model (store-level pool, confirmed with My Home store management, 2026-07) — see §5.3.

---

## 12. Implementation findings (Foundation + Phase 1c, 2026-07)

Real bugs found only by running the code against a live Postgres container — none were visible in document review, and each is now fixed in the codebase. Recorded here so they aren't rediscovered.

**Foundation:**
- `date_trunc('month', ts)` cannot appear in a `CREATE INDEX` expression — it's `STABLE`, not `IMMUTABLE`, in Postgres (depends on session timezone). Fixed to plain-column indexes (§3.4).
- **Postgres superusers/table owners bypass Row-Level Security entirely.** The `docker-compose` `POSTGRES_USER` is always a superuser. A dedicated non-superuser `steel_recon_app` role (migration `0003`) is mandatory in every environment, or every RLS policy in §3.3 is a silent no-op (§3.3).
- Bare `Mapped[datetime]` columns default to naive `TIMESTAMP`, but the app writes `datetime.now(timezone.utc)` everywhere — crashed the first real login. Fixed via a global `type_annotation_map = {datetime: TIMESTAMP(timezone=True)}` on `Base`, not per-column.
- A downgrade migration must `REVOKE EXECUTE` on functions before `DROP ROLE`, or Postgres refuses with `DependentObjectsStillExistError` — only surfaces when the downgrade path is actually exercised, which is easy to never do.

**Phase 1b (routers):**
- An early `towers` router took `project_id` as a URL path parameter instead of `ProjectScope`. A forged `project_id` in the URL was correctly rejected — but *only* because RLS caught the cross-project write at the DB layer; the route itself had exactly the anti-pattern §5.4 warns against. **Standing rule: no QS-scoped route may take `project_id` from path/body/query, ever** — not even for validation. Fixed by removing the parameter entirely (`/towers`, not `/projects/{project_id}/towers`).

**Phase 1c (transaction services):**
- The `ScrapSale` SQLAlchemy model omitted the DB's `total_amount GENERATED ALWAYS AS (weight_kg * rate_per_kg) STORED` column entirely — the ORM had no way to read it back. Fixed by mapping it with `Computed("weight_kg * rate_per_kg")`, which also tells SQLAlchemy to exclude it from INSERT/UPDATE (Postgres rejects explicit writes, even `NULL`, to a `GENERATED ALWAYS` column).
- `PhysicalCount.cut_pieces` had no SQLAlchemy `relationship()` at all — appending cut pieces via raw `session.add()` never populated the parent's in-memory collection, and reading `.cut_pieces` later (e.g. from Pydantic's `from_attributes` serialization) tried to lazy-load outside the request's async context, raising `MissingGreenlet`. Fixed by adding the `relationship()`/back-reference and an `eager_options = (selectinload(...),)` hook on `BaseRepository` that subclasses opt into — async SQLAlchemy cannot implicitly lazy-load relationships the way sync SQLAlchemy can.
- The `issue_exceeds_stock` blocking-mode promotion (§5.3's "no deploy needed" claim) is empirically verified: inserting one `rule_thresholds` row with `mode='blocking'` correctly turned a previously-advisory over-stock issue into a hard-rejected `422`, with zero rows written and the transaction cleanly rolled back — proving the advisory-lock + single-transaction design actually delivers the atomicity the plan claims, not just in theory.

**Phase 1d (Abstract + month-close):**
- The full A–N Abstract computation was verified against real (test-created) ledger data end to end: every section's number traced correctly back to the underlying `grn`/`store_issue`/`inter_site_transfer`/`jmr_actual`/`physical_count`/`scrap_sale` rows, and the derived arithmetic (C=A−B, G=E+F, H=C−G, K=I+J, L=H−K, M=K/G) was internally consistent throughout. This is the first live proof that the section formulas traced from the real Excel file (§4) actually compute correctly, not just read correctly in a document.
- Migration `0002`'s RLS policies only gave `SELECT`/`INSERT` to tables outside `CREATED_BY_TABLES` — no `UPDATE` policy. Postgres RLS defaults to **deny** for any action with no policy, so `finalized_month`'s reopen (`UPDATE status='reopened'`) silently matched zero rows, and SQLAlchemy raised a confusing `StaleDataError` instead of a clean RLS error. Fixed in migration `0004` by adding `UPDATE` policies for `finalized_month` and (pre-emptively, for the Phase-2 exception-resolve action) `exception_log`. `audit_log` and `monthly_abstract_snapshot` deliberately still have no `UPDATE` policy — both are append-only/immutable by design, and that absence is correct, not an oversight.
- The reopen → re-finalize cycle was verified end to end: re-finalizing a reopened month correctly creates a **new** `monthly_abstract_snapshot` row (both old and new retained in the table) while the single `finalized_month` lock row repoints `current_snapshot_id` to the newest one and keeps the reopen `reason` — exactly the "snapshot history is retained, lock is repointed" design in §3.2, now proven, not just asserted.

**Phase 1f (test suite):**
- `str(sqlalchemy.engine.URL)`/`repr()` masks the password with a literal `***` for safe logging (SQLAlchemy 1.4+) — building a connection string this way for the test suite's `steel_recon_app` role produced a URL containing the literal string `***` as the password, failing auth with a genuine (and initially confusing) `InvalidPasswordError`. Fixed with `URL.render_as_string(hide_password=False)`.
- **The test suite's Postgres connection must also NOT be a superuser**, for the same reason as dev (§3.3's Foundation finding) — testcontainers' default role is a superuser like `docker-compose`'s. The fixture runs migrations (including `0003`'s `steel_recon_app` role creation) as the superuser, then points the *app's* runtime connection at that restricted role for every test — otherwise the RLS integration tests would pass for the wrong reason (bypass, not enforcement), silently defeating their entire purpose.
- **Async SQLAlchemy engines cannot be shared across asyncio event loops** — `app.database.engine` is a process-wide singleton created once at import, but pytest-asyncio gives each test function its own event loop by default, corrupting asyncpg's transport on the second test (`AttributeError: 'NoneType' object has no attribute 'send'` deep in `asyncio.proactor_events`). Fixed with a session-scoped event loop (`pytest.ini`: `asyncio_default_fixture_loop_scope = session`, `asyncio_default_test_loop_scope = session`), matching the engine singleton's actual lifetime.
- Result: **16 tests** (4 unit, 12 integration) covering RLS tenant isolation, the `issue_exceeds_stock` invariant in both advisory and blocking mode, the full A–N Abstract computation traced against real ledger rows, and the complete finalize → lock-blocks-writes → reopen-requires-reason → re-finalize-creates-new-snapshot lifecycle — all passing in ~5 seconds against a real, ephemeral, migrated Postgres container. Every prior manual `curl`/`psql` verification in this section is now an automated regression test.

**Final end-to-end smoke test (all 12 routers, fresh database):** two more real bugs surfaced only by hitting every endpoint in one pass, neither caught by the (necessarily narrower) automated suite above:
- `PhysicalCountRepository.add_with_cut_pieces` appended cut pieces via `instance.cut_pieces.append(...)` inside a `for` loop — when the request's `cut_pieces` list was empty (a legitimate, common case: a count with only full-length stock, no cut pieces that month), the loop body never ran, so the relationship collection was never touched and stayed in an "unknown" state, triggering the same `MissingGreenlet` lazy-load crash the read-side `eager_options` fix (§12 Phase 1c) was supposed to have closed off entirely. Fixed by assigning the whole list (`instance.cut_pieces = [...]`), even when empty — this explicitly marks the collection as loaded with zero items, so no later read ever needs a DB round-trip. **Lesson: an eager-load fix on the read path does not protect the write path from the same lazy-load trap if the write path can leave a relationship untouched.**
- No handler existed for `sqlalchemy.exc.IntegrityError` — a foreign key violation (e.g. `inter_site_transfer.to_project_id` pointing at a project that doesn't exist) surfaced as a raw 500 instead of a clean error. Added a generic handler mapping any `IntegrityError` to a 422 with the DB's own message, rather than one handler per constraint (new FK/CHECK constraints are added across the schema as it grows, and this is defense-in-depth behind Pydantic validation, not the primary guard).

---

## 13. Progress ledger (2026-07) — frontend build + upstream documents

Everything below was built in one continuous pass (milestones M0–M8) after §7's stack revision. Every claim here was verified live (real Postgres, real running backend, real HTTP calls), never by code review alone — the same discipline as §12.

**Backend — Phase 1 (unchanged from §12) + upstream documents (new):**
- All 7 original transaction services, the `issue_exceeds_stock` invariant, A–N Abstract, month-close, RLS, 13→15 routers: still green, untouched by this pass.
- **Migration `0005`** (purely additive, per §3.5/§0.5): `purchase_order` + `purchase_order_line`, `supplier_invoice` + `supplier_invoice_line`, `quality_check`, and 4 nullable columns on `grn` (`po_id`, `supplier_invoice_id`, `gross_weight_kg`, `tare_weight_kg`). Full RLS policies (SELECT/INSERT/UPDATE, `created_by`-checked where applicable) on every new table, matching the `0002` pattern exactly.
- **`InboundReconciliationRule`** (`applies_to="grn"`, advisory default): checks weighbridge-net vs gross−tare, accepted-net vs invoiced qty, cumulative-accepted vs PO-ordered qty, and flags "unreconciled" when neither a PO nor an invoice is linked. Pure/unit-testable, registered in `rules/registry.py` alongside `issue_exceeds_stock`.
- `GrnService.create` now pre-fetches every anchor inside the same transaction as the insert (mirroring `store_issue_service`'s stock-read pattern) and returns `(grn, warning)`; the router surfaces `warning` on the response exactly like store-issue's.
- **Exceptions inbox** (`GET /exceptions?status=`, `POST /exceptions/{id}/resolve`): the `ExceptionLog.resolution_type/resolver_reason/resolved_by/resolved_at` fields (already in the schema, migration `0004`'s pre-emptive UPDATE policy) are now wired end-to-end.
- **Verification:** all 16 pre-existing tests still pass after `0005` (fresh testcontainers Postgres, full migration chain). Live-verified against a running dev backend: a GRN matching its invoice within tolerance saves clean (`warning: null`); a GRN drifting 20% from its invoice **and** breaching its PO's ordered quantity fires both reasons in one advisory message; a GRN with neither PO nor invoice linked gets the "unreconciled" advisory; every advisory persists to `exception_log` and is resolvable (`open`→`resolved`, resolver fields populated). A final comprehensive smoke test hit **23/23** endpoints the frontend calls (200 with a valid token, 401 without) in one pass.

**Frontend — built from zero (§7's stack revision was a decision; this is the implementation):**
Stack: Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui (vendored into `src/components/ui/`), themed via CSS variables from the brand-anchored token system (My Home red as the one accent, ink/zinc neutrals carrying the UI, status colors reserved for state). Dev connects to the backend via a Vite proxy (`/api` → `:8000`) — zero backend CORS changes needed.

- `src/lib/`: `api.ts` (axios, JWT interceptor, 401→login redirect, error-envelope + per-field 422 parsing), `auth.tsx` (session restore, `RequireAuth` guard), `types.ts` (hand-mirrored from every Pydantic schema — masters, all 7 transactions, upstream documents, Abstract, dashboard, exceptions), `queries.ts` (React Query hooks; a `makeHooks<TRow,TCreate>` factory stamps list/create hooks for every transaction router from one pattern).
- `src/components/app/`: the primitive set — `Field`, `Banner` (the two-tier advisory/blocking model), `KpiCard`, `DataTable`, `EmptyState`, `ConfirmDialog` (with require-reason for Reopen), `Page`/`PageHeader` — all exercised live on `/styleguide`.
- **Every screen the PRD calls for, built and wired to the real API:** Login → Dashboard (KPIs derived from the live Abstract, never separately maintained) → GRN/Store Issues/Transfers/BBS/JMR/Physical Count (repeatable cut-piece rows, ≤1.5m auto-locks to scrap in the UI)/Scrap list+create pairs → **Purchase Orders/Supplier Invoices** (new, upstream capture's UI, dia-wise line items) → **GRN form now links PO + Invoice + gross/tare weighbridge fields**, with net weight auto-derived from gross−tare (redundant-entry avoidance) and the backend's advisory surfaced as a toast → **Abstract page** (the digital twin: A–N × dia grid, pinned Section/Total columns, formula tooltips on computed rows, MT/KG toggle, month navigation, Finalize/Reopen with the confirm-dialog + require-reason pattern) → **Exceptions inbox** (open/resolved tabs, approve/corrected/follow-up resolution with a reason).
- **Verification:** every milestone build was run to a clean `tsc -b && vite build` before moving on. Route-level code-splitting (`React.lazy` per page + manual vendor chunks for react/query/radix) cut the largest chunk from 661KB to 312KB and eliminated the bundler's size warning entirely. The live dev server was confirmed serving the SPA shell, client-side routes, and the API proxy correctly (200/200/401 as expected).
- **Coexistence note:** a separate, fully-built marketing landing page (`src/landing/`, `Nav`/`HeroSection`/`ProblemSection`/`HowItWorks`/`PromisesSection`/`MetricsBar`/`FaqSection`/`CtaSection`/`Footer`) was authored in parallel and is wired at `/`; this build's routes live under `/dashboard` and are unaffected by it. Both compile together cleanly.

**What this pass deliberately did not touch:** the Phase-2 rules beyond `inbound_reconciliation` (bundle-weight variance, sequencing, batch rules), the Excel backfill parser, Excel export, and the acceptance-gate back-test — all still gated on the open items in §11 (per-tower workbooks, back-test benchmark site, real closed-month documents).

---

*Synthesized from: the PRD; OpenCode's planner/database-reviewer/code-architect outputs; MongoDB-vs-Postgres analysis (locked to PostgreSQL); a live confirmation of the store-level stock model with My Home store management; a second-pass review of this document by OpenCode, which surfaced 5 real fixes (GRN provenance via join tables, date-column naming, snapshot/lock linkage, rule-dispatch mechanism, frontend detail); live implementation against a real Postgres container, which surfaced the findings in §12; and the full frontend + upstream-documents build in §13, verified end-to-end against a live backend.*
