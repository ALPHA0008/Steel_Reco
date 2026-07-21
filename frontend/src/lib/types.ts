/**
 * TypeScript mirrors of the backend Pydantic schemas
 * (backend/app/schemas/*.py). Decimals arrive as strings.
 */

// ---- Masters ----

export interface Vendor {
  id: string
  name: string
  gst: string | null
  is_active: boolean
}

export interface Contractor {
  id: string
  code: string
  name: string
  is_active: boolean
}

export interface DiaGrade {
  id: string
  diameter_mm: string
  grade: string
  unit_weight_kg_per_m: string
  is_active: boolean
}

// ---- Upstream documents (plan §3.5) ----

export interface PurchaseOrderLineCreate {
  dia_grade_id: string
  ordered_qty_kg: string
  rate_per_kg?: string | null
}

export interface PurchaseOrderLine extends PurchaseOrderLineCreate {
  id: string
}

export interface PurchaseOrderCreate {
  po_number: string
  vendor_id: string
  order_date: string
  status?: "open" | "partial" | "closed" | "cancelled"
  lines: PurchaseOrderLineCreate[]
}

export interface PurchaseOrder {
  id: string
  project_id: string
  po_number: string
  vendor_id: string
  order_date: string
  status: "open" | "partial" | "closed" | "cancelled"
  created_at: string
  lines: PurchaseOrderLine[]
}

export interface SupplierInvoiceLineCreate {
  dia_grade_id: string
  invoiced_qty_kg: string
  rate_per_kg?: string | null
}

export interface SupplierInvoiceLine extends SupplierInvoiceLineCreate {
  id: string
}

export interface SupplierInvoiceCreate {
  invoice_number: string
  vendor_id: string
  po_id?: string | null
  invoice_date: string
  eway_bill_number?: string | null
  vehicle_number?: string | null
  lines: SupplierInvoiceLineCreate[]
}

export interface SupplierInvoice {
  id: string
  project_id: string
  invoice_number: string
  vendor_id: string
  po_id: string | null
  invoice_date: string
  eway_bill_number: string | null
  vehicle_number: string | null
  created_at: string
  lines: SupplierInvoiceLine[]
}

// ---- GRN ----

export type ReceiptType = "against_po" | "other_site_sap" | "other_site_excel"

export interface GrnCreate {
  vendor_id: string
  dia_grade_id: string
  po_reference?: string | null
  weighbridge_weight_kg: string
  receipt_type: ReceiptType
  source_site?: string | null
  gate_entry_at: string // ISO datetime
  notes?: string | null
  po_id?: string | null
  supplier_invoice_id?: string | null
  gross_weight_kg?: string | null
  tare_weight_kg?: string | null
}

export interface Grn {
  id: string
  project_id: string
  vendor_id: string
  dia_grade_id: string
  po_reference: string | null
  weighbridge_weight_kg: string
  receipt_type: ReceiptType
  source_site: string | null
  gate_entry_at: string
  effective_date: string
  notes: string | null
  created_at: string
  po_id: string | null
  supplier_invoice_id: string | null
  gross_weight_kg: string | null
  tare_weight_kg: string | null
  /** populated when the inbound-reconciliation rule fires (advisory) */
  warning: string | null
}

// ---- Store Issue ----

export interface StoreIssueCreate {
  contractor_id: string
  dia_grade_id: string
  quantity_kg: string
  direction: "out" | "in"
  issuing_staff?: string | null
  effective_date: string
}

export interface StoreIssue {
  id: string
  contractor_id: string
  dia_grade_id: string
  quantity_kg: string
  direction: "out" | "in"
  issuing_staff: string | null
  effective_date: string
  created_at: string
  /** populated when an advisory rule fired (e.g. issue exceeds stock) */
  warning: string | null
}

// ---- Inter-site Transfer ----

export interface InterSiteTransferCreate {
  to_project_id: string
  dia_grade_id: string
  quantity_kg: string
  flag: "loan" | "return"
  record_source: "sap" | "excel"
  ho_approval_ref?: string | null
  expected_return_date?: string | null
  effective_date: string
}

export interface InterSiteTransfer {
  id: string
  from_project_id: string
  to_project_id: string
  dia_grade_id: string
  quantity_kg: string
  flag: "loan" | "return"
  record_source: "sap" | "excel"
  ho_approval_ref: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  effective_date: string
  created_at: string
  warning: string | null
}

// ---- BBS / JMR ----

export interface BbsPlanCreate {
  tower_id: string
  floor_id: string
  element_id?: string | null
  bar_mark?: string | null
  pour_description?: string | null
  dia_grade_id: string
  planned_weight_kg: string
  drawing_ref?: string | null
  contractor_id?: string | null
}

export interface BbsPlan extends BbsPlanCreate {
  id: string
  created_at: string
}

export interface JmrActualCreate {
  tower_id: string
  floor_id: string
  element_id?: string | null
  bar_mark?: string | null
  dia_grade_id: string
  measured_weight_kg: string
  contractor_id?: string | null
  pour_number?: string | null
  drawing_ref?: string | null
  effective_date: string
  /** Set when this entry re-states an earlier one — the original stays for
   * audit but stops counting in the Abstract and rule checks. */
  corrected_from_id?: string | null
}

export interface JmrActual extends JmrActualCreate {
  id: string
  created_at: string
  warning: string | null
}

// ---- Physical Count ----

export type CutPieceClassification = "reusable" | "used_as_safety_steel" | "scrap"

export interface CutPieceCreate {
  length_mm: number
  nos: number
  weight_kg: string
  classification: CutPieceClassification
}

export interface PhysicalCountCreate {
  contractor_id: string
  dia_grade_id: string
  bundle_count: number
  each_bundle_weight_kg?: string | null
  loose_rod_count: number
  each_rod_weight_kg?: string | null
  effective_date: string
  notes?: string | null
  cut_pieces: CutPieceCreate[]
}

export interface PhysicalCount {
  id: string
  contractor_id: string
  dia_grade_id: string
  bundle_count: number
  each_bundle_weight_kg: string | null
  loose_rod_count: number
  each_rod_weight_kg: string | null
  effective_date: string
  notes: string | null
  created_at: string
  cut_pieces: Array<CutPieceCreate & { id: string }>
}

// ---- Scrap ----

export interface ScrapSaleCreate {
  buyer_name: string
  weight_kg: string
  rate_per_kg: string
  gate_pass_no?: string | null
  invoice_ref?: string | null
  effective_date: string
  notes?: string | null
}

export interface ScrapSale extends Omit<ScrapSaleCreate, "notes"> {
  id: string
  total_amount: string
  notes: string | null
  created_at: string
}

// ---- Exceptions (rules-engine output, plan §6) ----

export type ExceptionStatus = "open" | "resolved" | "dismissed"
export type ExceptionResolutionType = "approved" | "corrected" | "follow_up"

export interface ExceptionLog {
  id: string
  project_id: string
  rule_name: string
  severity: "advisory" | "blocking"
  transaction_table: string | null
  transaction_id: string | null
  threshold_value: string | null
  actual_value: string | null
  message: string | null
  status: ExceptionStatus
  resolution_type: ExceptionResolutionType | null
  resolver_reason: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

// ---- Dashboard ----

export interface DashboardSummary {
  period_label: string
  total_received_kg: string
  total_issued_kg: string
  total_scrap_sold_kg: string
  wastage_pct: string | null
}

// ---- Admin multi-site dashboard ----

export interface AdminSiteSummary {
  project_id: string
  name: string
  location: string | null
  status: string
  contract_wastage_pct: string
  period_label: string | null
  total_received_kg: string
  total_issued_kg: string
  total_scrap_sold_kg: string
  wastage_pct: string | null
  over_cap: boolean
  open_exceptions: number
  wastage_spark: number[]
}

export interface AdminMasterSummary {
  site_count: number
  sites_over_cap: number
  total_received_kg: string
  total_issued_kg: string
  total_scrap_sold_kg: string
  open_exceptions: number
  weighted_wastage_pct: string | null
}

// ---- Executive analytics payload (single rich call for the redesigned admin dashboard) ----

export interface AnalyticsTrendPoint {
  year: number
  month: number
  wastage_pct: number | null
}

export interface AnalyticsSite {
  project_id: string
  name: string
  location: string | null
  latitude: number | null
  longitude: number | null
  cap_pct: number
  health: number
  risk: "low" | "medium" | "high" | "critical"
  received_mt: number
  issued_mt: number
  consumed_mt: number
  scrap_mt: number
  physical_mt: number
  balance_mt: number
  wastage_pct: number | null
  wastage_qty_mt: number
  over_cap: boolean
  open_exceptions: number
  exception_rules: Record<string, number>
  forecast_pct: number | null
  latest_activity: string | null
  spark: number[]
  trend: AnalyticsTrendPoint[]
}

export interface AnalyticsInsight {
  severity: "info" | "warning" | "critical"
  title: string
  detail: string
  project_id: string | null
}

export interface AnalyticsAction {
  title: string
  detail: string
  project_id: string | null
  priority: "high" | "medium" | "low"
}

export interface AnalyticsParetoRow {
  name: string
  value: number
  cumulative_pct: number
}

export interface AnalyticsTimelineItem {
  kind: "grn" | "issue" | "scrap" | "exception"
  project_id: string
  site: string
  date: string | null
  qty_mt: number | null
  note: string | null
}

export interface AdminAnalytics {
  generated_at: string | null
  portfolio: {
    health: number
    wastage_pct: number | null
    received_mt: number
    issued_mt: number
    consumed_mt: number
    scrap_mt: number
    physical_mt: number
    wastage_qty_mt: number
    site_count: number
    sites_over_cap: number
    open_exceptions: number
  }
  sites: AnalyticsSite[]
  portfolio_trend: { year: number; month: number; wastage_pct: number; moving_avg: number | null }[]
  portfolio_forecast_pct: number | null
  insights: AnalyticsInsight[]
  recommended_actions: AnalyticsAction[]
  sankey: {
    received_mt: number
    issued_mt: number
    consumed_mt: number
    scrap_mt: number
    balance_mt: number
    physical_mt: number
  }
  pareto: {
    wastage: AnalyticsParetoRow[]
    scrap: AnalyticsParetoRow[]
    exceptions: AnalyticsParetoRow[]
  }
  moving_average_note: string
  timeline: AnalyticsTimelineItem[]
}

// ---- Abstract (sections A–N, all KG; computed, never stored) ----

export interface AbstractSectionARow {
  dia: string
  against_po_kg: string | null
  other_site_sap_kg: string | null
  other_site_excel_kg: string | null
  total_received_kg: string | null
}

export interface AbstractSectionBRow {
  dia: string
  transfer_sap_kg: string | null
  transfer_excel_kg: string | null
  total_transferred_kg: string | null
}

export interface AbstractSectionDRow {
  dia: string
  contractor_id: string
  contractor_name: string
  issued_out_kg: string | null
  returned_in_kg: string | null
  net_issued_kg: string | null
}

export interface AbstractSectionERow {
  dia: string
  contractor_id: string
  contractor_name: string
  consumption_kg: string | null
}

export interface AbstractSectionFRow {
  dia: string
  contractor_id: string
  wip_kg: string | null
}

export interface AbstractSectionIJRow {
  dia: string
  contractor_id: string
  full_length_kg: string | null
  cut_piece_stock_kg: string | null
  cut_piece_scrap_kg: string | null
  total_physical_kg: string | null
}

export interface GrnPoSummaryRow {
  po_reference: string
  grn_count: number
  total_kg: string
  first_date: string
  last_date: string
  linked_count: number
}

export interface SectionHealth {
  code: string
  label: string
  status: "real" | "aggregate" | "synthetic" | "computed" | "stale"
  detail: string
}

export interface DataHealthResponse {
  generated_for_period: string
  sections: SectionHealth[]
  po_invoice_linkage_pct: number | null
  grn_total: number
  grn_linked: number
  open_exceptions: number
  total_exceptions: number
  earliest_activity: string | null
  latest_activity: string | null
}

export interface PeriodBounds {
  earliest_year: number | null
  earliest_month: number | null
  latest_year: number | null
  latest_month: number | null
}

export interface WastageTrendPoint {
  year: number
  month: number
  period_label: string
  wastage_pct: string | null
}

export interface WastageTrendResponse {
  contract_wastage_cap_pct: string
  points: WastageTrendPoint[]
}

export interface AbstractResponse {
  project_id: string
  year: number
  month: number
  period_label: string
  section_a_received: AbstractSectionARow[]
  section_b_transferred: AbstractSectionBRow[]
  section_c_net_received: Record<string, string>
  section_d_issued: AbstractSectionDRow[]
  section_e_consumption: AbstractSectionERow[]
  section_f_wip: AbstractSectionFRow[]
  section_g_consumption_plus_wip: Record<string, string>
  section_h_theoretical_stock: Record<string, string>
  sections_ij_physical_stock: AbstractSectionIJRow[]
  section_k_total_physical: Record<string, string>
  section_l_wastage_qty: Record<string, string>
  section_m_wastage_pct: string | null
  section_n_scrap_sold_kg: string
  findings: AbstractFinding[]
  pipeline_version: string
}

/** Aggregate cross-check computed over the whole Abstract — advisory,
 * annotates the report without blocking it. */
export interface AbstractFinding {
  rule: string
  severity: string
  dia: string | null
  actual_kg: string
  threshold_kg: string
  message: string
}

export interface FinalizeResponse {
  finalized_month_id: string
  snapshot_id: string
  status: string
  year: number
  month: number
  finalized_at: string
}

// ---- Structure ----

export interface Project {
  id: string
  name: string
  location: string | null
  status: string
  contract_wastage_pct: string
}

export interface Tower {
  id: string
  project_id: string
  name: string
  sequence: number
}

export interface Floor {
  id: string
  project_id: string
  tower_id: string
  level_name: string
  sequence: number
}

export type ElementType =
  | "footing"
  | "column"
  | "shear_wall"
  | "slab"
  | "staircase"
  | "ramp"
  | "retaining_wall"
  | "beam"
  | "podium"
  | "misc"

export interface Element {
  id: string
  project_id: string
  tower_id: string
  floor_id: string
  element_type: ElementType
  name: string
}
