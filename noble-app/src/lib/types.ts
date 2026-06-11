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
