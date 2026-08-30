import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Store, TodayVisit } from "@/lib/types";

// ステータスごとのバッジ表示。未記入は赤で強調(記入漏れ防止)
function StatusBadge({ status }: { status: TodayVisit["status"] }) {
  const styles: Record<string, string> = {
    予定: "bg-gray-100 text-gray-600",
    未記入: "bg-red-100 text-red-700 ring-1 ring-red-300",
    記入済: "bg-green-100 text-green-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

export default async function KartePage({
  searchParams,
}: {
  searchParams: { store?: string };
}) {
  const supabase = createClient();
  const storeFilter = searchParams.store ?? "all";

  const { data: stores } = await supabase.from("stores").select("*").order("name");

  let query = supabase
    .from("v_today_visits")
    .select("*")
    .order("start_at", { ascending: true });
  if (storeFilter !== "all") query = query.eq("store_id", storeFilter);
  const { data: visits } = await query;

  const list = (visits ?? []) as TodayVisit[];
  const unfilled = list.filter((v) => v.status === "未記入").length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">カルテ — 今日の来店</h1>
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString("ja-JP")} ・ {list.length}件
            {unfilled > 0 && (
              <span className="ml-2 font-semibold text-red-600">
                未記入 {unfilled}件
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 全店舗合算 / 店舗別の切り替え */}
      <div className="mb-4 flex gap-2">
        <StoreTab href="/karte" label="全店舗" active={storeFilter === "all"} />
        {(stores as Store[] | null)?.map((s) => (
          <StoreTab
            key={s.id}
            href={`/karte?store=${s.id}`}
            label={s.name}
            active={storeFilter === s.id}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            本日の来店予定はありません
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">時刻</th>
                <th className="px-4 py-3">顧客</th>
                <th className="px-4 py-3">店舗</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 tabular-nums">
                    {v.start_at
                      ? new Date(v.start_at).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{v.customer_name}</td>
                  <td className="px-4 py-3 text-gray-500">{v.store_name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/karte/${v.id}`}
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-dark"
                    >
                      カルテを開く
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StoreTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm ${
        active
          ? "bg-ink font-semibold text-white"
          : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}
