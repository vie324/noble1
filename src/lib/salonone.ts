import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMonths } from "@/lib/format";

// ============================================================
// サロンワン 分析API（読み取り専用）
//   認証: ヘッダ X-SalonOne-Api-Key（環境変数 SALONONE_API_KEY。サーバー専用）
//   制限: 1分あたり60リクエスト。超えると 429（Retry-After 秒）
//   売上・新規数は /sales/summary?group_by=shop を使う（明細から自前で合計すると
//   定義がずれるため、サロンワンの仕様書でもこのエンドポイントの利用が指定されている）
// ============================================================

const BASE_URL = "https://salonone.net/api/analytics/v1";

export class SalonOneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

// 画面に出すエラーメッセージ（キーや応答本文は含めない）
export function salonOneErrorMessage(e: unknown): string {
  if (!(e instanceof SalonOneError)) return "サロンワンからの取り込みに失敗しました";
  switch (e.code) {
    case "not_configured":
      return "サロンワンの API キー（SALONONE_API_KEY）が未設定です";
    case "unauthorized":
      return "サロンワンの API キーが無効です（期限切れ・失効の可能性があります）";
    case "rate_limited":
      return "サロンワンの利用回数の上限に達しました。1分ほど待ってからやり直してください";
    default:
      return `サロンワンからの取り込みに失敗しました（${e.code ?? e.status}）`;
  }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.SALONONE_API_KEY;
  if (!key) throw new SalonOneError("SALONONE_API_KEY is not set", 0, "not_configured");

  const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-SalonOne-Api-Key": key, Accept: "application/json" },
      cache: "no-store",
    });
    // 上限超過は1回だけ待って再試行（長く待つ必要があるときはエラーにする）
    const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    if (res.status === 429 && attempt === 0 && retryAfter > 0 && retryAfter <= 10) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code: string | undefined = body?.error?.code;
      const errorId: string | undefined = body?.error?.error_id;
      throw new SalonOneError(
        `SalonOne ${path} ${res.status} ${code ?? ""} ${errorId ?? ""}`.trim(),
        res.status,
        code
      );
    }
    return body as T;
  }
}

/* ---------------- 店舗 ---------------- */

export interface SalonOneShop {
  id: number;
  name: string;
  deleted_at: string | null;
}

export async function listSalonOneShops(): Promise<SalonOneShop[]> {
  const shops: SalonOneShop[] = [];
  let cursor = "";
  for (;;) {
    const res = await get<{
      data: SalonOneShop[];
      meta: { has_more?: boolean; next_cursor?: string | null };
    }>("/shops", { limit: "1000", ...(cursor ? { cursor } : {}) });
    shops.push(...res.data.map(({ id, name, deleted_at }) => ({ id, name, deleted_at })));
    if (!res.meta.has_more || !res.meta.next_cursor) return shops;
    cursor = res.meta.next_cursor;
  }
}

/* ---------------- 売上サマリ（店舗別・月単位） ---------------- */

type Amounts = {
  gross_sales: number;
  consumed_sales: number;
  digest_sales: number;
  refund_amount: number;
};

interface ShopSalesSummary extends Amounts {
  shop_id: number;
  shop_name: string;
  digest_count: number;
  new_visit_count: number;
  repeat_visit_count: number;
  amounts_jpy?: Partial<Amounts>; // 店舗の通貨が円以外のときの円換算
}

// 月初日 → その月の末日
function monthEnd(monthFirst: string): string {
  const [y, m] = monthFirst.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthFirst.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

async function fetchMonthlySalesByShop(month: string) {
  const res = await get<{ data: ShopSalesSummary[] }>("/sales/summary", {
    from: month,
    to: monthEnd(month),
    group_by: "shop",
  });
  const fetchedAt = new Date().toISOString();
  return res.data.map((r) => {
    const jpy = (k: keyof Amounts) => Math.round(r.amounts_jpy?.[k] ?? r[k] ?? 0);
    return {
      shop_id: r.shop_id,
      month,
      shop_name: r.shop_name,
      gross_sales: jpy("gross_sales"),
      consumed_sales: jpy("consumed_sales"),
      digest_sales: jpy("digest_sales"),
      digest_count: r.digest_count ?? 0,
      refund_amount: jpy("refund_amount"),
      new_visit_count: r.new_visit_count ?? 0,
      repeat_visit_count: r.repeat_visit_count ?? 0,
      fetched_at: fetchedAt,
    };
  });
}

// from〜to（月初日。両端を含む）の各月を取り込み、salonone_monthly_sales に上書き保存する。
// 月ごとに1リクエスト（全店舗分を group_by=shop でまとめて取得）
export async function importSalonOneMonths(
  from: string,
  to: string
): Promise<{ months: number; rows: number }> {
  const months: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  if (months.length === 0 || months.length > 12) {
    throw new Error(`取り込み期間が不正です: ${from}〜${to}`);
  }

  const rows = (await Promise.all(months.map(fetchMonthlySalesByShop))).flat();
  if (rows.length > 0) {
    const { error } = await createAdminClient()
      .from("salonone_monthly_sales")
      .upsert(rows, { onConflict: "shop_id,month" });
    if (error) throw new Error(`salonone_monthly_sales の保存に失敗しました: ${error.message}`);
  }
  return { months: months.length, rows: rows.length };
}
