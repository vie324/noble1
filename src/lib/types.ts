// ドメイン型定義（DBスキーマと対応）

export type Role = "admin" | "staff";
export type VisitStatus = "scheduled" | "filled";
export type PhotoKind = "before" | "after";
export type FlagColorKey = "caution" | "warn" | "ok" | "rose" | "gold";

export interface Store {
  id: number;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  salonone_shop_id: number | null; // サロンワンの店舗ID（026）
  salonone_from: string | null; // サロンワン切替月（月初日。この月以降の実績はサロンワン）
}

export type EmploymentType = "employee" | "part_time" | "contractor";

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  employee: "正社員",
  part_time: "パート・アルバイト",
  contractor: "業務委託",
};

export interface Staff {
  id: number;
  auth_user_id: string | null;
  email: string;
  name: string;
  kana: string | null;
  role: Role;
  store_id: number | null;
  icon_emoji: string;
  theme_color: string;
  is_active: boolean;
  employment_type?: EmploymentType; // 027 未適用の環境では undefined
}

export interface Menu {
  id: number;
  name: string;
  price: number;
  store_ids: number[];
  sort_order: number;
  is_active: boolean;
}

export interface BodyPart {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface FlagType {
  id: number;
  name: string;
  color_key: FlagColorKey;
  sort_order: number;
  is_active: boolean;
}

export interface TicketProduct {
  id: number;
  name: string;
  total_count: number;
  price: number;
  valid_days: number;
  sort_order: number;
  is_active: boolean;
}

export interface Customer {
  id: number;
  name: string;
  kana: string;
  phone: string;
  email: string | null;
  primary_store_id: number | null;
  line_chat_url: string | null;
  booking_memo: string | null;
  first_visit_on: string | null;
  created_at: string;
  // 旧システム（カルテくん）から取り込んだ項目。手入力の顧客では null
  karte_no: string | null;
  gender: "女性" | "男性" | "その他" | null;
  birthday: string | null;
  occupation: string | null;
  postal_code: string | null;
  address: string | null;
  allergy_note: string | null;
  acquisition_source: string | null; // 来店動機（カンマ区切り）
  last_visit_at: string | null;
  imported_at: string | null;
}

export interface CustomerFlag {
  id: number;
  customer_id: number;
  flag_type_id: number;
  note: string | null;
  resolved_at: string | null;
  flag_types?: FlagType;
}

export interface CustomerNote {
  id: number;
  customer_id: number;
  body: string;
  pinned: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Visit {
  id: number;
  customer_id: number;
  store_id: number;
  staff_id: number | null;
  scheduled_at: string;
  status: VisitStatus;
  memo: string | null;
  important_memo: string | null;
  filled_at: string | null;
  nominated: boolean;
  karte_visit_no?: string | null; // 旧システムの来店記録番号（取り込み分のみ）
}

export interface VisitPhoto {
  id: number;
  visit_id: number;
  kind: PhotoKind;
  storage_path: string;
}

export interface CustomerTicket {
  id: number;
  customer_id: number;
  product_id: number;
  store_id: number | null;
  purchased_at: string;
  expires_at: string;
  total_count: number;
  remaining_count: number;
  price: number;
  ticket_products?: TicketProduct;
}

export interface TicketUsage {
  id: number;
  customer_ticket_id: number;
  visit_id: number | null;
  used_at: string;
  canceled_at: string | null;
}

/* ---------------- フェーズ2: シフト・カレンダー ---------------- */

export type ShiftStatus = "draft" | "confirmed";
export type RequestType = "ok" | "ng" | "time" | "usual" | "any";
export type EventType =
  | "off"
  | "task"
  | "training"
  | "meeting"
  | "practice"
  | "shooting"
  | "closing"
  | "todo"
  | "change";

export interface ShiftRecruitment {
  id: number;
  month: string;
  status: "open" | "closed";
  note: string | null;
}

export interface ShiftRequest {
  id: number;
  staff_id: number;
  month: string;
  date: string;
  type: RequestType;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export interface Shift {
  id: number;
  staff_id: number;
  store_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  acknowledged_at: string | null;
  staff?: Pick<Staff, "id" | "name" | "icon_emoji" | "theme_color">;
}

export interface AttendanceRecord {
  id: number;
  shift_id: number;
  actual_start: string;
  actual_end: string;
  diff_reason: string | null;
}

// 時間給（管理者専用テーブル。行がない = 未設定）
export interface StaffPaySettings {
  staff_id: number;
  hourly_wage: number;
}

// 交通費 往復/日（スタッフ × 店舗。管理者専用テーブル。行がない = 未設定）
export interface StaffTransportCost {
  id: number;
  staff_id: number;
  store_id: number;
  round_trip_cost: number;
}

// 業務委託報酬にかかる消費税率。交通費は実費弁償のため課税対象外として扱う
// （報酬税込 = 時間給×稼働時間×(1+税率) + 交通費）
export const PAY_TAX_RATE = 0.1;

export interface CalendarEvent {
  id: number;
  store_id: number | null;
  date: string;
  type: EventType;
  title: string;
  repeat_weekday: number | null;
  repeat_until: string | null;
  created_by: string | null;
}

export const EVENT_TYPE_META: Record<
  EventType,
  { label: string; color: FlagColorKey }
> = {
  off: { label: "休み", color: "rose" },
  task: { label: "定期タスク", color: "ok" },
  training: { label: "研修", color: "gold" },
  meeting: { label: "ミーティング", color: "gold" },
  practice: { label: "練習モデル", color: "rose" },
  shooting: { label: "撮影", color: "warn" },
  closing: { label: "月末・締め", color: "warn" },
  todo: { label: "TODO", color: "ok" },
  change: { label: "変更", color: "caution" },
};

export const REQUEST_TYPE_META: Record<RequestType, { label: string }> = {
  ok: { label: "○" },
  ng: { label: "×" },
  time: { label: "時間指定" },
  usual: { label: "いつも通り" },
  any: { label: "お任せ" },
};

/* ---------------- フェーズ3: カウンセリング・同意書・掲示板・在庫 ---------------- */

export interface CounselingQuestion {
  id: number;
  label: string;
  field_type: "text" | "textarea" | "choice" | "multi" | "yes_no" | "ack";
  options: string | null; // カンマ区切り
  sort_order: number;
  is_active: boolean;
}

export interface CounselingSheet {
  id: number;
  customer_id: number | null;
  token: string;
  status: "pending" | "submitted";
  answers: Record<string, string> | null;
  submitted_at: string | null;
  visit_id: number | null;
  // 受付（LINE等の固定URL）経由で本人が入力する情報。紐付け前の照合用
  applicant_name: string | null;
  applicant_kana: string | null;
  applicant_phone: string | null;
  store_id: number | null;
  created_at: string;
}

export interface ConsentTemplate {
  id: number;
  title: string;
  body: string;
  menu_tag: string | null; // 希望メニューとの紐付け（peeling_with 等）
  sort_order: number;
  is_active: boolean;
}

export interface ConsentDocument {
  id: number;
  customer_id: number | null;
  counseling_sheet_id: number | null;
  template_id: number | null;
  token: string;
  title: string;
  body_snapshot: string;
  status: "pending" | "signed";
  signer_name: string | null;
  signature_path: string | null;
  signed_at: string | null;
  created_at: string;
}

// 希望メニューの選択肢 → 同意書テンプレートの menu_tag
export const MENU_CONSENT_TAGS: Record<string, string> = {
  "ハーブピーリング（剥離あり）": "peeling_with",
  "ハーブピーリング（剥離なし）": "peeling_without",
  よもぎ蒸し: "yomogi",
  ハイドラフェイシャル: "hydra",
};

export interface GalleryPage {
  id: number;
  customer_id: number | null;
  token: string;
  title: string;
  message: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GalleryPhoto {
  id: number;
  gallery_id: number;
  storage_path: string;
  kind: "before" | "after";
  caption: string | null;
  sort_order: number;
}

export interface VisitConsumption {
  id: number;
  visit_id: number;
  product_id: number;
  amount: number;
}

export const BOARD_CATEGORIES = [
  "スタッフ割引価格",
  "店舗ルール",
  "FAQ",
  "研修資料",
  "ブログ・動画のネタ",
  "月末・締め作業手順",
  "その他",
] as const;

export interface BoardPost {
  id: number;
  category: (typeof BOARD_CATEGORIES)[number];
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  board_attachments?: BoardAttachment[];
}

export interface BoardAttachment {
  id: number;
  post_id: number;
  file_path: string;
  file_name: string;
}

export interface Product {
  id: number;
  name: string;
  unit: string;
  category: "商品" | "備品";
  sort_order: number;
  is_active: boolean;
}

export interface StockEntry {
  id: number;
  product_id: number;
  store_id: number;
  date: string;
  quantity: number;
  note: string | null;
  invoice_path: string | null;
}

export interface MenuConsumption {
  menu_id: number;
  product_id: number;
  amount: number;
}

export interface StockCount {
  id: number;
  product_id: number;
  store_id: number;
  month: string;
  counted_qty: number;
  diff_reason: string | null;
}

/* ---------------- 店舗別 月次目標・実績（経営 > 目標設定） ---------------- */

// 店舗 × 月 の目標（管理者専用テーブル。行がない／0 = 未設定）
export interface StoreMonthlyTarget {
  id: number;
  store_id: number;
  month: string; // 月初日 "YYYY-MM-01"
  target_sales: number; // 円
  target_new_customers: number; // 件
}

// 店舗 × 月 の実績（ビュー store_monthly_actuals。行がない = 実績なし）
export interface StoreMonthlyActual {
  store_id: number;
  month: string;
  // 以下の3項目は source により中身が変わる（noble: 実績入力・カルテ／salonone: サロンワン）
  cash_in: number; // 入金ベース。noble: 都度払い + 回数券販売 + 物販／salonone: 粗売上
  accounting_sales: number; // 会計上。noble: 都度払い + 回数券消化 + 物販／salonone: 消化売上
  new_customers: number; // noble: 初回来店日がその月の顧客数／salonone: 新規来店数（会計済み）
  source: "noble" | "salonone"; // 実績の取得元（切替月以降はサロンワン）
  fetched_at: string | null; // サロンワンから取り込んだ日時
}

// この店舗のこの月の実績がサロンワンの値か（ビュー store_monthly_actuals と同じ判定）
export function usesSalonOne(store: Store, month: string): boolean {
  return store.salonone_shop_id != null && store.salonone_from != null && month >= store.salonone_from;
}

// 1回あたりの単価（購入金額 ÷ 総回数）
export function ticketUnitPrice(t: Pick<CustomerTicket, "price" | "total_count">): number {
  return t.price / t.total_count;
}

// 未消化金額 = 残回数 × 単価
export function ticketUnusedAmount(
  t: Pick<CustomerTicket, "price" | "total_count" | "remaining_count">
): number {
  return Math.round(t.remaining_count * ticketUnitPrice(t));
}

/* ---------------- スタッフの個人情報（管理者のみ） ---------------- */
export interface StaffPrivate {
  staff_id: number;
  birth_date: string | null;
  postal_code: string | null;
  address: string | null;
  nearest_station: string | null;
  commute_route: string | null;
  personal_phone: string | null;
  personal_email: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  joined_on: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  memo: string | null;
}

/* ---------------- スタッフ向け書類（給与明細など） ---------------- */
export const STAFF_DOCUMENT_CATEGORIES = [
  "給与明細",
  "源泉徴収票",
  "支払調書",
  "契約書・雇用条件",
  "その他",
] as const;
export type StaffDocumentCategory = (typeof STAFF_DOCUMENT_CATEGORIES)[number];

export interface StaffDocument {
  id: number;
  staff_id: number;
  category: StaffDocumentCategory;
  title: string;
  month: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  viewed_at: string | null;
  created_at: string;
}

/* ---------------- 月締め・請求書 ---------------- */
export interface PayrollClosing {
  month: string;
  closed_at: string;
  closed_by: string | null;
  note: string | null;
}

export interface BusinessSettings {
  id: number;
  company_name: string | null;
  invoice_to_email: string | null;
  invoice_cc_email: string | null;
  payment_terms: string;
  payment_due_day: number | null;
  accountant_name: string | null;
  accountant_email: string | null;
  labor_consultant_name: string | null;
  labor_consultant_email: string | null;
}

export interface ContractorProfile {
  staff_id: number;
  issuer_name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  registration_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
}

export interface InvoiceLine {
  store_name: string;
  days: number;
  minutes: number;
  transport: number;
}

export interface ContractorInvoice {
  id: number;
  staff_id: number;
  month: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  lines: InvoiceLine[];
  hourly_wage: number;
  work_days: number;
  work_minutes: number;
  subtotal: number;
  tax: number;
  transport: number;
  total: number;
  issuer: Omit<ContractorProfile, "staff_id">;
  recipient: { company_name: string | null; email: string | null; cc: string | null; payment_terms: string | null };
  note: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------------- LINE 送信（定型文・画像・履歴） ---------------- */
export const LINE_TEMPLATE_CATEGORIES = [
  "お礼",
  "ご予約",
  "リマインド",
  "アフターケア",
  "キャンペーン",
  "その他",
] as const;

export interface LineTemplate {
  id: number;
  title: string;
  category: (typeof LINE_TEMPLATE_CATEGORIES)[number];
  body: string;
  sort_order: number;
  is_active: boolean;
}

export interface LineMedia {
  id: number;
  title: string;
  storage_path: string;
  sort_order: number;
  is_active: boolean;
}

export interface LineMessageLog {
  id: number;
  customer_id: number | null;
  sent_by: number | null;
  template_id: number | null;
  kind: string;
  body: string | null;
  image_count: number;
  created_at: string;
}
