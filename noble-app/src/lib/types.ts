// ドメイン型 (Phase 0〜2 の中核)
// 本番では `supabase gen types typescript` で自動生成に置き換える想定

export type StaffRole = "admin" | "manager" | "staff";
export type VisitStatus = "予定" | "未記入" | "記入済";

export interface Store {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Customer {
  id: string;
  store_id: string | null;
  name: string;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  line_user_id: string | null;
  salonboard_memo: string | null;
  first_visit_date: string | null;
}

export interface Visit {
  id: string;
  customer_id: string;
  store_id: string;
  staff_id: string | null;
  visit_date: string;
  start_at: string | null;
  status: VisitStatus;
  note: string | null;
  important_note: string | null;
}

// v_today_visits ビューの行
export interface TodayVisit extends Visit {
  customer_name: string;
  name_kana: string | null;
  store_name: string;
}

export interface VisitItem {
  id: string;
  visit_id: string;
  menu_id: string | null;
  body_part: string | null;
  quantity: number;
  price: number | null;
  paid_by_ticket: boolean;
}

// v_ticket_balance ビューの行
export interface TicketBalance {
  customer_ticket_id: string;
  customer_id: string;
  ticket_plan_id: string | null;
  total_count: number;
  used_count: number;
  remaining_count: number;
  remaining_amount: number;
  expires_at: string;
  expiring_soon: boolean;
  status: string;
}
