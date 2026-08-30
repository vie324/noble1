import { createClient } from "@/lib/supabase/server";

// 回数券の未消化残高一覧(台帳ビュー v_ticket_balance を表示)
export default async function TicketsPage() {
  const supabase = createClient();

  const { data: balances } = await supabase
    .from("v_ticket_balance")
    .select("*, customers(name)")
    .gt("remaining_count", 0)
    .order("expires_at");

  const list = (balances ?? []) as any[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">回数券 — 未消化残高</h1>
      <p className="mb-4 text-sm text-gray-500">
        残高は消化台帳から自動算出されます（カウンタ書き換えではありません）
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">顧客</th>
              <th className="px-4 py-3 text-right">残回数</th>
              <th className="px-4 py-3 text-right">未消化金額</th>
              <th className="px-4 py-3">有効期限</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.customer_ticket_id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{b.customers?.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {b.remaining_count} / {b.total_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ¥{Number(b.remaining_amount).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {b.expires_at}
                  {b.expiring_soon && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      期限間近
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
