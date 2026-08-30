import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveVisit, consumeTicket } from "../actions";
import type { TicketBalance } from "@/lib/types";

export default async function KarteDetailPage({
  params,
}: {
  params: { visitId: string };
}) {
  const supabase = createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select("*, customers(*), stores(name)")
    .eq("id", params.visitId)
    .single();

  if (!visit) notFound();
  const customer = visit.customers as any;

  // 施術明細
  const { data: items } = await supabase
    .from("visit_items")
    .select("*, menus(name)")
    .eq("visit_id", params.visitId);

  // この顧客の有効な回数券残高
  const { data: balances } = await supabase
    .from("v_ticket_balance")
    .select("*")
    .eq("customer_id", customer.id)
    .gt("remaining_count", 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/karte" className="text-sm text-gray-500 hover:underline">
        ← 今日の来店一覧へ
      </Link>

      <div className="mb-4 mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{customer.name}</h1>
          <p className="text-sm text-gray-500">
            {customer.name_kana} ・ {(visit.stores as any)?.name} ・{" "}
            {visit.visit_date}
          </p>
        </div>
        <Link
          href={`/customers/${customer.id}`}
          className="text-sm text-gold-dark hover:underline"
        >
          過去カルテ履歴
        </Link>
      </div>

      {/* 重要事項 / LINE導線 */}
      {visit.important_note && (
        <div className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">
          ⚠️ {visit.important_note}
        </div>
      )}
      {customer.line_user_id && (
        <a
          href={`https://line.me/R/`}
          className="mb-4 inline-block text-sm text-green-600 hover:underline"
        >
          → LINEチャットへ
        </a>
      )}

      {/* 施術明細 */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-ink">施術メニュー・部位</h2>
        {items && items.length > 0 ? (
          <ul className="text-sm">
            {items.map((it: any) => (
              <li key={it.id} className="flex justify-between border-b border-gray-50 py-1.5">
                <span>
                  {it.menus?.name ?? "—"}
                  {it.body_part && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {it.body_part}
                    </span>
                  )}
                </span>
                <span className="text-gray-500">
                  {it.paid_by_ticket ? "回数券" : `¥${(it.price ?? 0).toLocaleString()}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">未入力</p>
        )}
      </section>

      {/* 回数券消化 */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-ink">回数券</h2>
        {balances && balances.length > 0 ? (
          (balances as TicketBalance[]).map((b) => (
            <form
              key={b.customer_ticket_id}
              action={consumeTicket}
              className="flex items-center justify-between border-b border-gray-50 py-2 text-sm"
            >
              <input type="hidden" name="customer_ticket_id" value={b.customer_ticket_id} />
              <input type="hidden" name="visit_id" value={params.visitId} />
              <span>
                残 {b.remaining_count}回 ・ ¥{Number(b.remaining_amount).toLocaleString()}
                {b.expiring_soon && (
                  <span className="ml-2 text-red-600">期限間近 ({b.expires_at})</span>
                )}
              </span>
              <button className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-dark">
                1回消化
              </button>
            </form>
          ))
        ) : (
          <p className="text-sm text-gray-400">有効な回数券はありません</p>
        )}
      </section>

      {/* メモ入力 → 記入済へ */}
      <form action={saveVisit} className="rounded-xl border border-gray-200 bg-white p-4">
        <input type="hidden" name="visit_id" value={params.visitId} />
        <h2 className="mb-2 font-semibold text-ink">カルテメモ</h2>
        <label className="mb-1 block text-xs text-gray-500">重要事項(強調表示されます)</label>
        <input
          name="important_note"
          defaultValue={visit.important_note ?? ""}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-xs text-gray-500">自由記述</label>
        <textarea
          name="note"
          defaultValue={visit.note ?? ""}
          rows={5}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white">
          保存して記入済にする
        </button>
      </form>
    </div>
  );
}
