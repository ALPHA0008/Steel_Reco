"""initial schema — masters, structure, transactions, system tables

Revision ID: 0001
Revises:
Create Date: 2026-07-02

Written by hand against the models in app/models/, matching IMPLEMENTATION_PLAN.md
section 3 exactly (table shapes, constraints, FKs). Table creation order respects
FK dependencies: masters -> projects -> structure -> transactions -> system.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgcrypto provides gen_random_uuid(), used as the server_default on every PK
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ---------------------------------------------------------------- masters
    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("gst", sa.String(50)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "contractors",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "dia_grades",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("diameter_mm", sa.Numeric(4, 1), nullable=False),
        sa.Column("grade", sa.String(20), nullable=False, server_default="Fe500"),
        sa.Column("unit_weight_kg_per_m", sa.Numeric(6, 4), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("diameter_mm", "grade"),
    )

    # -------------------------------------------------------- projects (tenant root)
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255)),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("contract_wastage_pct", sa.Numeric(5, 2), nullable=False, server_default="3.00"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('active','closed')", name="ck_project_status"),
    )

    # rule_thresholds references projects, so it comes after
    op.create_table(
        "rule_thresholds",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("rule_name", sa.String(100), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True)),  # NULL = global default
        sa.Column("threshold_key", sa.String(100), nullable=False),
        sa.Column("threshold_value", sa.Numeric(12, 4)),
        sa.Column("mode", sa.String(10), nullable=False, server_default="advisory"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("mode IN ('advisory','blocking')", name="ck_rule_threshold_mode"),
        sa.UniqueConstraint("rule_name", "project_id", "threshold_key"),
    )

    # -------------------------------------------------------------- structure
    op.create_table(
        "towers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "name"),
    )

    op.create_table(
        "floors",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tower_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("towers.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("level_name", sa.String(100), nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tower_id", "level_name"),
    )

    op.create_table(
        "elements",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tower_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("towers.id"), nullable=False),
        sa.Column("floor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("floors.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("element_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "element_type IN ('footing','column','shear_wall','slab','staircase','ramp',"
            "'retaining_wall','beam','podium','misc')",
            name="ck_element_type",
        ),
        sa.UniqueConstraint("floor_id", "element_type", "name"),
    )

    # ------------------------------------------------------------------ users
    # (created before transaction tables since every ledger row FKs to created_by)
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="QS"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('QS','admin')", name="ck_user_role"),
    )

    op.create_table(
        "project_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("assigned_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "project_id"),
    )

    # -------------------------------------------------------------- grn (receipts)
    op.create_table(
        "grn",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("po_reference", sa.String(100)),
        sa.Column("weighbridge_weight_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("receipt_type", sa.String(20), nullable=False),
        sa.Column("source_site", sa.String(100)),
        sa.Column("gate_entry_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("slip_photo_uri", sa.String(500)),
        sa.Column("notes", sa.Text),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("weighbridge_weight_kg > 0", name="ck_grn_weight_positive"),
        sa.CheckConstraint(
            "receipt_type IN ('against_po','other_site_sap','other_site_excel')",
            name="ck_grn_receipt_type",
        ),
    )
    op.create_foreign_key("fk_grn_corrected_from", "grn", "grn", ["corrected_from_id"], ["id"])

    # ------------------------------------------------------------ store_issue
    op.create_table(
        "store_issue",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("contractor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contractors.id"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("quantity_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("issuing_staff", sa.String(255)),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("quantity_kg > 0", name="ck_store_issue_qty_positive"),
        sa.CheckConstraint("direction IN ('out','in')", name="ck_store_issue_direction"),
    )
    op.create_foreign_key(
        "fk_store_issue_corrected_from", "store_issue", "store_issue", ["corrected_from_id"], ["id"]
    )

    op.create_table(
        "store_issue_grn_link",
        sa.Column("store_issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("store_issue.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("grn_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("grn.id"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
    )
    op.create_index("idx_sigl_grn", "store_issue_grn_link", ["grn_id"])

    # ------------------------------------------------------ inter_site_transfer
    op.create_table(
        "inter_site_transfer",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("from_project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("to_project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("quantity_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("flag", sa.String(10), nullable=False),
        sa.Column("record_source", sa.String(10), nullable=False),
        sa.Column("ho_approval_ref", sa.String(100)),
        sa.Column("expected_return_date", sa.Date),
        sa.Column("actual_return_date", sa.Date),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("quantity_kg > 0", name="ck_transfer_qty_positive"),
        sa.CheckConstraint("flag IN ('loan','return')", name="ck_transfer_flag"),
        sa.CheckConstraint("record_source IN ('sap','excel')", name="ck_transfer_source"),
    )
    op.create_foreign_key(
        "fk_transfer_corrected_from", "inter_site_transfer", "inter_site_transfer", ["corrected_from_id"], ["id"]
    )

    op.create_table(
        "inter_site_transfer_grn_link",
        sa.Column("transfer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inter_site_transfer.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("grn_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("grn.id"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
    )

    # ------------------------------------------------------------------ bbs_plan
    op.create_table(
        "bbs_plan",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("tower_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("towers.id"), nullable=False),
        sa.Column("floor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("floors.id"), nullable=False),
        sa.Column("element_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("elements.id")),
        sa.Column("bar_mark", sa.String(50)),
        sa.Column("pour_description", sa.String(255)),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("planned_weight_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("dia_weights", postgresql.JSONB),
        sa.Column("drawing_ref", sa.String(100)),
        sa.Column("contractor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contractors.id")),
        sa.Column("backfill_run_id", sa.String(100)),
        sa.Column("source_file", sa.String(500)),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_foreign_key("fk_bbs_plan_corrected_from", "bbs_plan", "bbs_plan", ["corrected_from_id"], ["id"])

    # ---------------------------------------------------------------- jmr_actual
    op.create_table(
        "jmr_actual",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("tower_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("towers.id"), nullable=False),
        sa.Column("floor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("floors.id"), nullable=False),
        sa.Column("element_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("elements.id")),
        sa.Column("bar_mark", sa.String(50)),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("measured_weight_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("contractor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contractors.id")),
        sa.Column("pour_number", sa.String(50)),
        sa.Column("drawing_ref", sa.String(100)),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_foreign_key("fk_jmr_actual_corrected_from", "jmr_actual", "jmr_actual", ["corrected_from_id"], ["id"])

    # ----------------------------------------------------------- element_progress
    op.create_table(
        "element_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("element_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("elements.id"), nullable=False),
        sa.Column("as_of_date", sa.Date, nullable=False),
        sa.Column("completion_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("completion_pct BETWEEN 0 AND 100", name="ck_progress_pct_range"),
        sa.UniqueConstraint("element_id", "as_of_date"),
    )

    # --------------------------------------------------------------- physical_count
    op.create_table(
        "physical_count",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("contractor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contractors.id"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("bundle_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("each_bundle_weight_kg", sa.Numeric(12, 2)),
        sa.Column("loose_rod_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("each_rod_weight_kg", sa.Numeric(12, 4)),
        sa.Column("photo_uri", sa.String(500)),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("bundle_count >= 0", name="ck_pc_bundle_nonneg"),
        sa.CheckConstraint("loose_rod_count >= 0", name="ck_pc_loose_nonneg"),
    )
    op.create_foreign_key(
        "fk_physical_count_corrected_from", "physical_count", "physical_count", ["corrected_from_id"], ["id"]
    )

    op.create_table(
        "physical_count_cut_piece",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("physical_count_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("physical_count.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("length_mm", sa.Integer, nullable=False),
        sa.Column("nos", sa.Integer, nullable=False),
        sa.Column("weight_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("classification", sa.String(20), nullable=False),
        sa.CheckConstraint("length_mm >= 0", name="ck_cutpiece_length_nonneg"),
        sa.CheckConstraint("nos >= 0", name="ck_cutpiece_nos_nonneg"),
        sa.CheckConstraint("weight_kg >= 0", name="ck_cutpiece_weight_nonneg"),
        sa.CheckConstraint(
            "classification IN ('reusable','used_as_safety_steel','scrap')",
            name="ck_cutpiece_classification",
        ),
        sa.CheckConstraint("length_mm > 1500 OR classification = 'scrap'", name="scrap_rule"),
    )

    # ------------------------------------------------------------------ scrap_sale
    op.create_table(
        "scrap_sale",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("buyer_name", sa.String(255), nullable=False),
        sa.Column("weight_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("rate_per_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("gate_pass_no", sa.String(100)),
        sa.Column("invoice_ref", sa.String(100)),
        sa.Column("total_amount", sa.Numeric(14, 2), sa.Computed("weight_kg * rate_per_kg", persisted=True)),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("weight_kg > 0", name="ck_scrap_weight_positive"),
        sa.CheckConstraint("rate_per_kg >= 0", name="ck_scrap_rate_nonneg"),
    )
    op.create_foreign_key(
        "fk_scrap_sale_corrected_from", "scrap_sale", "scrap_sale", ["corrected_from_id"], ["id"]
    )

    # ---------------------------------------------------- monthly_abstract_snapshot
    op.create_table(
        "monthly_abstract_snapshot",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("sections", postgresql.JSONB, nullable=False),
        sa.Column("source_txn_hash", sa.String(64)),
        sa.Column("pipeline_version", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="finalized"),
        sa.Column("finalized_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "year", "month", "id"),
    )

    # -------------------------------------------------------------- finalized_month
    op.create_table(
        "finalized_month",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="locked"),
        sa.Column("reason", sa.Text),
        sa.Column("current_snapshot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monthly_abstract_snapshot.id")),
        sa.Column("locked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("locked_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_finalized_month_range"),
        sa.CheckConstraint("status IN ('locked','reopened')", name="ck_finalized_month_status"),
        sa.UniqueConstraint("project_id", "year", "month"),
    )

    # -------------------------------------------------------------------- audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id")),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("row_id", postgresql.UUID(as_uuid=True)),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("before_json", postgresql.JSONB),
        sa.Column("after_json", postgresql.JSONB),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "action IN ('CREATE','UPDATE','DELETE','CORRECT','FINALIZE','REOPEN')",
            name="ck_audit_action",
        ),
    )

    # ---------------------------------------------------------------- exception_log
    op.create_table(
        "exception_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("rule_name", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="advisory"),
        sa.Column("transaction_table", sa.String(100)),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True)),
        sa.Column("threshold_value", sa.Numeric(14, 4)),
        sa.Column("actual_value", sa.Numeric(14, 4)),
        sa.Column("message", sa.Text),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("resolution_type", sa.String(20)),
        sa.Column("resolver_reason", sa.Text),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('open','resolved','dismissed')", name="ck_exception_status"),
        sa.CheckConstraint(
            "resolution_type IS NULL OR resolution_type IN ('approved','corrected','follow_up')",
            name="ck_exception_resolution_type",
        ),
    )

    # ----------------------------------------------------- indexes (plan §3.4)
    op.create_index("idx_towers_project", "towers", ["project_id"])
    op.create_index("idx_floors_tower", "floors", ["tower_id"])
    op.create_index("idx_floors_project", "floors", ["project_id"])
    op.create_index("idx_elements_tower", "elements", ["tower_id"])
    op.create_index("idx_elements_floor", "elements", ["floor_id"])
    op.create_index("idx_elements_project", "elements", ["project_id"])

    # NOTE: date_trunc('month', ts) is STABLE, not IMMUTABLE, in Postgres (its
    # result depends on the session timezone), so it cannot appear in an index
    # expression — CREATE INDEX rejects it outright. Indexing the plain
    # effective_date column instead serves the same monthly range-scan queries
    # (WHERE effective_date >= :month_start AND effective_date < :month_end)
    # just as well via a B-tree range scan.
    op.create_index("idx_grn_agg", "grn", ["project_id", "effective_date", "dia_grade_id"])
    op.create_index("idx_grn_vendor", "grn", ["vendor_id"])
    op.create_index("idx_grn_stock", "grn", ["project_id", "dia_grade_id"])
    op.create_index("idx_grn_correction_chain", "grn", ["corrected_from_id"], postgresql_where=sa.text("corrected_from_id IS NOT NULL"))

    op.create_index("idx_si_agg", "store_issue", ["project_id", "effective_date", "dia_grade_id"])
    op.create_index("idx_si_contractor", "store_issue", ["contractor_id"])
    op.create_index("idx_si_stock", "store_issue", ["project_id", "dia_grade_id"])
    op.create_index("idx_si_correction_chain", "store_issue", ["corrected_from_id"], postgresql_where=sa.text("corrected_from_id IS NOT NULL"))

    op.create_index("idx_transfer_project", "inter_site_transfer", ["project_id", "effective_date", "dia_grade_id"])
    op.create_index("idx_transfer_to_project", "inter_site_transfer", ["to_project_id", "effective_date"])

    op.create_index("idx_bbs_plan_project", "bbs_plan", ["project_id"])
    op.create_index("idx_bbs_plan_tower_floor", "bbs_plan", ["tower_id", "floor_id", "dia_grade_id"])
    op.create_index("idx_bbs_plan_backfill", "bbs_plan", ["backfill_run_id", "source_file"])

    op.create_index("idx_jmr_actual_agg", "jmr_actual", ["project_id", "effective_date", "dia_grade_id"])
    op.create_index("idx_jmr_actual_tower_floor", "jmr_actual", ["tower_id", "floor_id", "dia_grade_id"])

    op.create_index("idx_pc_agg", "physical_count", ["project_id", "effective_date", "dia_grade_id"])
    op.create_index("idx_pc_contractor_dia_date", "physical_count", ["contractor_id", "dia_grade_id", "effective_date"])

    op.create_index("idx_ss_agg", "scrap_sale", ["project_id", "effective_date"])

    op.create_index("idx_mas_project_period", "monthly_abstract_snapshot", ["project_id", "year", "month"])
    op.create_index("idx_al_project", "audit_log", ["project_id", "created_at"])
    op.create_index("idx_al_table_row", "audit_log", ["table_name", "row_id"])
    op.create_index("idx_pa_user", "project_assignments", ["user_id"])
    op.create_index("idx_exception_project_status", "exception_log", ["project_id", "status", "created_at"])


def downgrade() -> None:
    op.drop_table("exception_log")
    op.drop_table("audit_log")
    op.drop_table("finalized_month")
    op.drop_table("monthly_abstract_snapshot")
    op.drop_table("scrap_sale")
    op.drop_table("physical_count_cut_piece")
    op.drop_table("physical_count")
    op.drop_table("element_progress")
    op.drop_table("jmr_actual")
    op.drop_table("bbs_plan")
    op.drop_table("inter_site_transfer_grn_link")
    op.drop_table("inter_site_transfer")
    op.drop_table("store_issue_grn_link")
    op.drop_table("store_issue")
    op.drop_table("grn")
    op.drop_table("project_assignments")
    op.drop_table("users")
    op.drop_table("elements")
    op.drop_table("floors")
    op.drop_table("towers")
    op.drop_table("rule_thresholds")
    op.drop_table("projects")
    op.drop_table("dia_grades")
    op.drop_table("contractors")
    op.drop_table("vendors")
