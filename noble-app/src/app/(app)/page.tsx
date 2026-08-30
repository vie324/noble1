import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Phase 0 のダッシュボード雛形。
// 既存の売上分析は、カルテ入力(visits/visit_items)を源泉に順次移植していく。
export default async function DashboardPage() {
  const supabase = createClient();

  const today = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await supabase
    .from("visits")
    .select("*", { count: "exact", head: true })
    .eq("visit_date", today);

  const { count: unfilledCount } = await supabase
    .from("visits")
    .select("*", { count: "exact", head: true })
    .eq("visit_date", today)
    .eq("status", "未記入");

  // 回数券の未消化金額合計
  const { data: balances } = await supabase
    .from("v_ticket_balance")
    .select("remaining_amount, expiring_soon")
    .gt("remaining_count", 0);
  const outstanding = (balances ?? []).reduce(
    (s, b: any) => s + Number(b.remaining_amount),
    0,
  );
  const expiringSoon = (balances ?? []).filter((b: any) => b.expiring_soon).length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">ダッシュボード</h1>
      <p className="mb-6 text-sm text-gray-500">経営サマリー（Phase 0）</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="本日の来店" value={`${todayCount ?? 0} 件`} href="/karte" />
        <Card
          title="未記入カルテ"
          value={`${unfilledCount ?? 0} 件`}
          href="/karte"
          alert={(unfilledCount ?? 0) > 0}
        />
        <Card
          title="回数券 未消化残高"
          value={`¥${outstanding.toLocaleString()}`}
          href="/tickets"
        />
        <Card
          title="期限間近の回数券"
          value={`${expiringSoon} 件`}
          href="/tickets"
          alert={expiringSoon > 0}
        />
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        売上・媒体・メニュー別・部位別などの詳細分析は、カルテ入力を源泉に
        既存ダッシュボードのロジックを順次移植します（Phase 8）。
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  href,
  alert,
}: {
  title: string;
  value: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 transition hover:shadow-md"
    >
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${alert ? "text-red-600" : "text-ink"}`}>
        {value}
      </p>
    </Link>
  );
}
