"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  Badge,
  Button,
  Card,
  Chip,
  ListSkeleton,
  SectionTitle,
  TextArea,
} from "@/components/ui";
import { FlagBadges } from "@/components/flags";
import { BeforeAfterPhotos } from "@/components/before-after-photos";
import { dateLabelJa, daysUntil, timeHM, yen, ticketLabel, staffLabel } from "@/lib/format";
import { ticketUnusedAmount } from "@/lib/types";
import type {
  BodyPart,
  Customer,
  CustomerFlag,
  CustomerNote,
  CustomerTicket,
  Menu,
  Staff,
  TicketUsage,
  Visit,
} from "@/lib/types";

interface VisitDetail extends Visit {
  customers: Customer & {
    customer_flags: CustomerFlag[];
    customer_notes: CustomerNote[];
  };
}

export default function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const visitId = Number(id);
  const router = useRouter();
  const { stores } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  // マスタ
  const [menus, setMenus] = useState<Menu[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // 入力値
  const [menuIds, setMenuIds] = useState<number[]>([]);
  const [partIds, setPartIds] = useState<number[]>([]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [importantMemo, setImportantMemo] = useState("");

  // 回数券
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [usages, setUsages] = useState<TicketUsage[]>([]);
  const [ticketBusy, setTicketBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counseling, setCounseling] = useState<{
    answers: Record<string, string>;
    submitted_at: string | null;
  } | null>(null);
  const [counselingOpen, setCounselingOpen] = useState(true);

  const loadTickets = useCallback(
    async (customerId: number) => {
      const [{ data: t }, { data: u }] = await Promise.all([
        supabase
          .from("customer_tickets")
          .select("*, ticket_products (*)")
          .eq("customer_id", customerId)
          .order("expires_at"),
        supabase.from("ticket_usages").select("*").eq("visit_id", visitId),
      ]);
      setTickets((t as CustomerTicket[]) ?? []);
      setUsages((u as TicketUsage[]) ?? []);
    },
    [supabase, visitId]
  );

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: m }, { data: bp }, { data: st }, { data: vm }, { data: vp }] =
        await Promise.all([
          supabase
            .from("visits")
            .select("*, customers (*, customer_flags (*, flag_types (*)), customer_notes (*))")
            .eq("id", visitId)
            .maybeSingle(),
          supabase.from("menus").select("*").eq("is_active", true).order("sort_order"),
          supabase.from("body_parts").select("*").eq("is_active", true).order("sort_order"),
          supabase.from("staff").select("*").eq("is_active", true).order("id"),
          supabase.from("visit_menus").select("menu_id").eq("visit_id", visitId),
          supabase.from("visit_body_parts").select("body_part_id").eq("visit_id", visitId),
        ]);

      if (!v) {
        setNotFound(true);
        return;
      }
      const detail = v as unknown as VisitDetail;
      setVisit(detail);
      setMenus((m as Menu[]) ?? []);
      setBodyParts((bp as BodyPart[]) ?? []);
      setStaffList((st as Staff[]) ?? []);
      setMenuIds((vm ?? []).map((r) => r.menu_id));
      setPartIds((vp ?? []).map((r) => r.body_part_id));
      setStaffId(detail.staff_id);
      setMemo(detail.memo ?? "");
      setImportantMemo(detail.important_memo ?? "");
      await loadTickets(detail.customer_id);

      // カウンセリング回答（このカルテに紐付くもの → なければ直近の回答済み）
      const { data: linked } = await supabase
        .from("counseling_sheets")
        .select("answers, submitted_at")
        .eq("visit_id", visitId)
        .eq("status", "submitted")
        .maybeSingle();
      if (linked?.answers) {
        setCounseling(linked as { answers: Record<string, string>; submitted_at: string | null });
      } else {
        const { data: latest } = await supabase
          .from("counseling_sheets")
          .select("answers, submitted_at")
          .eq("customer_id", detail.customer_id)
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.answers) {
          setCounseling(latest as { answers: Record<string, string>; submitted_at: string | null });
          setCounselingOpen(false); // 過去の回答は折りたたんで表示
        }
      }
    })();
  }, [supabase, visitId, loadTickets]);

  // 「前回と同じ」: 直近の記入済みカルテからメニュー・部位を複製
  async function copyFromLastVisit() {
    if (!visit) return;
    const { data: last } = await supabase
      .from("visits")
      .select("id, visit_menus (menu_id), visit_body_parts (body_part_id)")
      .eq("customer_id", visit.customer_id)
      .eq("status", "filled")
      .neq("id", visitId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!last) {
      setError("複製できる過去のカルテがありません");
      return;
    }
    setMenuIds((last.visit_menus ?? []).map((r: { menu_id: number }) => r.menu_id));
    setPartIds(
      (last.visit_body_parts ?? []).map((r: { body_part_id: number }) => r.body_part_id)
    );
    setError(null);
  }

  // 回数券を1回消化
  async function handleUseTicket(ticketId: number) {
    setTicketBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("use_ticket", {
      p_customer_ticket_id: ticketId,
      p_visit_id: visitId,
    });
    if (err) setError(err.message.includes("残回数") ? "残回数がありません" : "消化に失敗しました");
    if (visit) await loadTickets(visit.customer_id);
    setTicketBusy(false);
  }

  // 消化の取り消し
  async function handleCancelUsage(usageId: number) {
    setTicketBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("cancel_ticket_usage", {
      p_usage_id: usageId,
    });
    if (err) setError("取り消しに失敗しました");
    if (visit) await loadTickets(visit.customer_id);
    setTicketBusy(false);
  }

  // カルテ保存（記入済みへ）
  async function handleSave(markFilled: boolean) {
    if (!visit) return;
    setSaving(true);
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from("visits")
        .update({
          staff_id: staffId,
          memo: memo.trim() || null,
          important_memo: importantMemo.trim() || null,
          ...(markFilled
            ? { status: "filled", filled_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", visitId);
      if (upErr) throw upErr;

      // メニュー・部位は洗い替え
      await supabase.from("visit_menus").delete().eq("visit_id", visitId);
      if (menuIds.length > 0) {
        const { error: e1 } = await supabase
          .from("visit_menus")
          .insert(menuIds.map((menu_id) => ({ visit_id: visitId, menu_id })));
        if (e1) throw e1;
      }
      await supabase.from("visit_body_parts").delete().eq("visit_id", visitId);
      if (partIds.length > 0) {
        const { error: e2 } = await supabase
          .from("visit_body_parts")
          .insert(partIds.map((body_part_id) => ({ visit_id: visitId, body_part_id })));
        if (e2) throw e2;
      }

      router.push("/");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。もう一度お試しください");
      setSaving(false);
    }
  }

  if (notFound) {
    return <p className="text-muted py-12 text-center">カルテが見つかりません</p>;
  }
  if (!visit) {
    return <ListSkeleton rows={5} />;
  }

  const c = visit.customers;
  const activeFlags = c.customer_flags.filter((f) => !f.resolved_at);
  const pinnedNotes = c.customer_notes.filter((n) => n.pinned);
  const storeName = stores.find((s) => s.id === visit.store_id)?.name ?? "—";
  const activeUsages = usages.filter((u) => !u.canceled_at);
  const availableMenus = menus.filter(
    (m) => m.store_ids.length === 0 || m.store_ids.includes(visit.store_id)
  );
  const dateOnly = visit.scheduled_at.slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto space-y-5 fade-in">
      {/* ヘッダー: 顧客情報 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="serif text-3xl text-ink">{c.name} 様</h1>
          <p className="text-sm text-muted mt-1">
            {dateLabelJa(dateOnly)} {timeHM(visit.scheduled_at)} ・ {storeName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {visit.status === "scheduled" ? (
            <Badge color="warn">未記入</Badge>
          ) : (
            <Badge color="ok">記入済み</Badge>
          )}
          <Link href={`/customers/${c.id}`} className="text-xs text-gold-dk underline underline-offset-2">
            お客様ページへ
          </Link>
        </div>
      </div>

      {/* 要注意情報を最上部に固定表示（来店前チェック） */}
      {(activeFlags.length > 0 || pinnedNotes.length > 0) && (
        <Card className="p-4 border-caution/40 bg-caution-soft/40 space-y-2" hairline={false}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FlagBadges flags={activeFlags} />
          </div>
          {activeFlags
            .filter((f) => f.note)
            .map((f) => (
              <p key={f.id} className="text-sm text-caution font-medium">
                {f.note}
              </p>
            ))}
          {pinnedNotes.map((n) => (
            <p key={n.id} className="text-sm text-ink">
              {n.body}
            </p>
          ))}
        </Card>
      )}

      {/* カウンセリングシートの回答（確認しながらカルテ記入できる） */}
      {counseling && (
        <Card className="p-4 space-y-2 border-gold/50">
          <button
            type="button"
            onClick={() => setCounselingOpen(!counselingOpen)}
            aria-expanded={counselingOpen}
            className="w-full flex items-center justify-between text-left"
          >
            <SectionTitle className="flex-1">カウンセリングシートの回答</SectionTitle>
            <span className="text-muted text-sm shrink-0 ml-2" aria-hidden>
              {counselingOpen ? "▲" : "▼"}
            </span>
          </button>
          {counselingOpen && (
            <dl className="space-y-2 fade-in">
              {Object.entries(counseling.answers).map(([q, a]) => (
                <div key={q}>
                  <dt className="text-[11px] text-muted">{q}</dt>
                  <dd className="text-sm text-ink whitespace-pre-wrap">
                    {a === "確認済み" ? "確認済み（注意事項）" : a || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}

      {/* 施術内容 */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle className="flex-1">施術メニュー</SectionTitle>
          <Button variant="ghost" onClick={copyFromLastVisit}>
            前回と同じ
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {availableMenus.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              selected={menuIds.includes(m.id)}
              onClick={() =>
                setMenuIds(
                  menuIds.includes(m.id)
                    ? menuIds.filter((x) => x !== m.id)
                    : [...menuIds, m.id]
                )
              }
            />
          ))}
        </div>

        <SectionTitle>施術部位</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {bodyParts.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={partIds.includes(p.id)}
              onClick={() =>
                setPartIds(
                  partIds.includes(p.id)
                    ? partIds.filter((x) => x !== p.id)
                    : [...partIds, p.id]
                )
              }
            />
          ))}
        </div>

        <SectionTitle>担当スタッフ</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {staffList.map((s) => (
            <Chip
              key={s.id}
              label={staffLabel(s)}
              selected={staffId === s.id}
              onClick={() => setStaffId(s.id)}
            />
          ))}
        </div>
      </Card>

      {/* 回数券の利用 */}
      <Card className="p-4 space-y-3">
        <SectionTitle>回数券の利用</SectionTitle>

        {activeUsages.length > 0 && (
          <div className="space-y-2">
            {activeUsages.map((u) => {
              const t = tickets.find((x) => x.id === u.customer_ticket_id);
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl bg-ok-soft border border-ok/30 px-4 py-2.5"
                >
                  <p className="text-sm text-ok font-semibold">
                    ✓ {t ? ticketLabel(t) : "回数券"} を1回消化
                  </p>
                  <Button
                    variant="ghost"
                    disabled={ticketBusy}
                    onClick={() => handleCancelUsage(u.id)}
                  >
                    取り消す
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {tickets.length === 0 ? (
          <p className="text-sm text-muted">保有中の回数券はありません</p>
        ) : (
          <ul className="space-y-2">
            {/* 期限が近い順に表示 → タップで1回消化 */}
            {tickets
              .filter((t) => t.remaining_count > 0 && daysUntil(t.expires_at) >= 0)
              .map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={ticketBusy}
                    onClick={() => handleUseTicket(t.id)}
                    className="w-full flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 text-left hover:border-gold hover:bg-gold-soft transition-colors disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium text-ink">{ticketLabel(t)}</p>
                      <p className="text-xs text-muted mt-0.5 tnum">
                        残 {t.remaining_count}/{t.total_count} 回 ・ 未消化{" "}
                        {yen(ticketUnusedAmount(t))} ・ 期限 あと{daysUntil(t.expires_at)}日
                      </p>
                    </div>
                    <span className="text-gold-dk text-sm font-semibold shrink-0">
                      1回消化 ›
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* 写真 */}
      <Card className="p-4 space-y-3">
        <SectionTitle>施術前後の写真</SectionTitle>
        <BeforeAfterPhotos visitId={visitId} />
      </Card>

      {/* メモ */}
      <Card className="p-4 space-y-4">
        <SectionTitle>メモ</SectionTitle>
        <TextArea
          label="自由記述メモ"
          rows={3}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="施術の所感、お客様との会話など"
        />
        <TextArea
          label="重要事項（次回来店時に必ず表示されます）"
          rows={2}
          value={importantMemo}
          onChange={(e) => setImportantMemo(e.target.value)}
          placeholder="例: 次回サンプルをお渡しする約束"
          className="border-rose/60 bg-rose-soft/30"
        />
      </Card>

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1">
          {saving ? "保存中…" : visit.status === "scheduled" ? "記入を完了する" : "保存する"}
        </Button>
        <Button variant="ghost" onClick={() => handleSave(false)} disabled={saving}>
          下書き保存
        </Button>
      </div>
    </div>
  );
}
