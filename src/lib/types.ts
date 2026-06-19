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
}

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
