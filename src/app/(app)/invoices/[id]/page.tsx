"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { useInbox } from "@/lib/inbox";
import { useCanShare, useOrigin } from "@/lib/client-env";
import { MailComposeButtons } from "@/components/mail-compose";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ListSkeleton } from "@/components/ui";
import { dateSlash, hoursLabel, monthLabelJa, yen } from "@/lib/format";
import type { ContractorInvoice } from "@/lib/types";

const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${y}年${m}月${d}日`;
};

// 請求書（業務委託）。本人と管理者が閲覧できる。印刷すると A4 の請求書になる
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, isAdmin } = useApp();
  const inbox = useInbox();
  const router = useRouter();
  const notify = useToast();
  const origin = useOrigin();
  const canShare = useCanShare();
  const supabase = useMemo(() => createClient(), []);
  const [invoice, setInvoice] = useState<ContractorInvoice | null | undefined>(undefined);
  const [composed, setComposed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("contractor_invoices").select("*").eq("id", Number(id)).maybeSingle();
    setInvoice((data as ContractorInvoice | null) ?? null);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (invoice === undefined) return <ListSkeleton rows={5} />;
  if (invoice === null) {
    return <p className="text-muted py-12 text-center">請求書が見つかりません</p>;
  }

  const inv = invoice;
  const own = inv.staff_id === me.id;
  const month = monthLabelJa(inv.month);
  const issuer = inv.issuer;
  const recipient = inv.recipient;
  const hours = Math.round((inv.work_minutes / 60) * 100) / 100;
  const bank = [issuer.bank_name, issuer.bank_branch, issuer.bank_account_type, issuer.bank_account_number]
    .filter(Boolean)
    .join(" ");

  const draft = {
    to: recipient.email ?? "",
    cc: recipient.cc,
    subject: `【請求書】${month}分 業務委託報酬（${issuer.issuer_name}）`,
    body: [
      `${recipient.company_name ?? ""} 御中`,
      "",
      `いつもお世話になっております。${issuer.issuer_name}です。`,
      `${month}分の請求書をお送りします。`,
      "",
      `請求番号: ${inv.invoice_number}`,
      `ご請求金額: ${yen(inv.total)}（税込）`,
      `お支払期限: ${longDate(inv.due_date)}`,
      `振込先: ${bank} ${issuer.bank_account_holder ?? ""}`,
      "",
      "請求書の詳細はこちらからご確認いただけます（NOBLE業務システム）:",
      `${origin}/invoices/${inv.id}`,
      "",
      "よろしくお願いいたします。",
      issuer.issuer_name,
    ].join("\n"),
  };

  async function markSent() {
    setBusy(true);
    const { error } = await supabase.rpc("mark_contractor_invoice_sent", { p_id: inv.id });
    setBusy(false);
    if (error) {
      notify("記録できませんでした", "error");
      return;
    }
    notify("送信済みにしました");
    inbox.refresh();
    await load();
  }

  async function reissue() {
    if (!window.confirm("最新の勤務実績・請求者情報で請求書を作り直しますか？")) return;
    setBusy(true);
    const { error } = await supabase.rpc("issue_contractor_invoice", { p_month: inv.month, p_note: inv.note });
    setBusy(false);
    if (error) {
      notify(error.message, "error");
      return;
    }
    notify("作り直しました");
    await load();
  }

  async function remove() {
    if (!window.confirm(`${issuer.issuer_name}さんの${month}分の請求書を削除しますか？\n（本人がもう一度作成できるようになります）`)) return;
    const { error } = await supabase.from("contractor_invoices").delete().eq("id", inv.id);
    if (error) {
      notify("削除できませんでした", "error");
      return;
    }
    notify("削除しました");
    router.push("/admin/payroll");
  }

  async function share() {
    try {
      await navigator.share({ title: draft.subject, text: draft.body, url: `${origin}/invoices/${inv.id}` });
    } catch {
      // キャンセル時は何もしない
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 fade-in">
      {/* 操作（印刷されない） */}
      <Card className="p-4 space-y-3 print:hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link href={own ? "/my/invoices" : "/admin/payroll"} className="text-sm text-gold-dk min-h-11 inline-flex items-center">
            ‹ {own ? "請求書の一覧" : "月締め・給与"}
          </Link>
          {inv.sent_at ? (
            <Badge color="ok">送信済み {dateSlash(inv.sent_at)}</Badge>
          ) : (
            <Badge color="gold">未送信</Badge>
          )}
        </div>

        {own && !inv.sent_at && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              内容を確認したら、<strong>Gmailで送信</strong>してください（宛先・件名・本文は入力済みです）
            </p>
            <MailComposeButtons draft={draft} label="Gmailで送信" onOpened={() => setComposed(true)} />
            <div
              className={`rounded-xl border px-3 py-3 space-y-2 ${
                composed ? "border-gold bg-gold-soft/50" : "border-hairline bg-base"
              }`}
            >
              <p className="text-xs text-muted">
                {composed
                  ? "Gmailで送信できたら、最後にこのボタンを押してください（管理者に送信済みと表示されます）"
                  : "送信が終わったら押してください"}
              </p>
              <Button className="w-full" variant={composed ? "primary" : "secondary"} disabled={busy} onClick={markSent}>
                送信済みにする
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => window.print()}>
            PDFで保存・印刷
          </Button>
          {canShare && (
            <Button variant="ghost" onClick={share}>
              共有…
            </Button>
          )}
          {own && !inv.sent_at && (
            <Button variant="ghost" disabled={busy} onClick={reissue}>
              作り直す
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" onClick={remove}>
              削除
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted">
          PDFで保存: iPhone は印刷画面で共有ボタン →「ファイルに保存」、PC は「送信先: PDFに保存」を選びます
        </p>
      </Card>

      {/* 請求書本体 */}
      <article className="print-sheet bg-white border border-hairline rounded-2xl p-5 sm:p-8 text-[#222] space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-[0.3em]">請求書</h1>
            <p className="mt-4 text-lg font-semibold border-b border-[#222] pb-1">
              {recipient.company_name || "（宛先未設定）"} 御中
            </p>
          </div>
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tnum self-start">
            <dt className="text-[#666]">請求番号</dt>
            <dd>{inv.invoice_number}</dd>
            <dt className="text-[#666]">発行日</dt>
            <dd>{longDate(inv.issue_date)}</dd>
          </dl>
        </header>

        <section className="space-y-2">
          <p className="text-sm">件名: {month}分 業務委託報酬</p>
          <p className="text-sm">下記のとおりご請求申し上げます。</p>
          <div className="flex items-baseline justify-between gap-4 border-y-2 border-[#222] py-3">
            <span className="text-sm font-semibold">ご請求金額（税込）</span>
            <span className="text-2xl font-bold tnum">{yen(inv.total)}</span>
          </div>
          <p className="text-sm tnum">お支払期限: {longDate(inv.due_date)}</p>
        </section>

        <section>
          <table className="w-full text-sm tnum border-collapse [&_td:not(:first-child)]:whitespace-nowrap [&_td:not(:first-child)]:pl-3 [&_th:not(:first-child)]:pl-3">
            <thead>
              <tr className="border-b border-[#222] text-[#555]">
                <th className="text-left py-1.5 font-semibold">内容</th>
                <th className="text-right font-semibold">数量</th>
                <th className="text-right font-semibold">単価</th>
                <th className="text-right font-semibold">金額</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#ddd]">
                <td className="py-2">業務委託報酬（{month}・{inv.work_days}日）</td>
                <td className="text-right">{hours}時間</td>
                <td className="text-right">{yen(inv.hourly_wage)}</td>
                <td className="text-right">{yen(inv.subtotal)}</td>
              </tr>
              <tr className="border-b border-[#ddd]">
                <td className="py-2">交通費（実費・非課税）</td>
                <td className="text-right">{inv.work_days}日</td>
                <td className="text-right"></td>
                <td className="text-right">{yen(inv.transport)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right pt-2 text-[#555]">小計（10%対象・税抜）</td>
                <td className="text-right pt-2">{yen(inv.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right text-[#555]">消費税（10%）</td>
                <td className="text-right">{yen(inv.tax)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right text-[#555]">交通費（非課税）</td>
                <td className="text-right">{yen(inv.transport)}</td>
              </tr>
              <tr className="font-bold">
                <td colSpan={3} className="text-right pt-1 border-t border-[#222]">合計</td>
                <td className="text-right pt-1 border-t border-[#222]">{yen(inv.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {inv.lines.length > 0 && (
          <section className="text-xs text-[#555] space-y-0.5 tnum">
            <p className="font-semibold">稼働の内訳</p>
            {inv.lines.map((l) => (
              <p key={l.store_name}>
                {l.store_name}: {l.days}日・{hoursLabel(l.minutes)}・交通費 {yen(l.transport)}
              </p>
            ))}
          </section>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-0.5">
            <p className="font-semibold">お振込先</p>
            <p>{bank || "—"}</p>
            <p>{issuer.bank_account_holder}</p>
            {recipient.payment_terms && <p className="text-xs text-[#666]">お支払条件: {recipient.payment_terms}</p>}
          </div>
          <div className="space-y-0.5 sm:text-right">
            <p className="font-semibold">{issuer.issuer_name}</p>
            {(issuer.postal_code || issuer.address) && (
              <p>
                {issuer.postal_code && `〒${issuer.postal_code} `}
                {issuer.address}
              </p>
            )}
            {issuer.phone && <p className="tnum">TEL {issuer.phone}</p>}
            {issuer.email && <p>{issuer.email}</p>}
            {issuer.registration_number && <p className="tnum">登録番号 {issuer.registration_number}</p>}
          </div>
        </section>

        {inv.note && (
          <section className="text-sm">
            <p className="font-semibold">備考</p>
            <p className="whitespace-pre-wrap">{inv.note}</p>
          </section>
        )}
      </article>
    </div>
  );
}
