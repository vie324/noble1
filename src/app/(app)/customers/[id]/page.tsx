"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
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
  TextField,
} from "@/components/ui";
import { FlagBadges } from "@/components/flags";
import { CustomerDocuments } from "@/components/customer-documents";
import {
  addDays,
  dateSlash,
  daysUntil,
  ticketLabel,
  timeHM,
  todayJST,
  yen,
} from "@/lib/format";
import { ticketUnusedAmount } from "@/lib/types";
import type {
  Customer,
  CustomerFlag,
  CustomerNote,
  CustomerTicket,
  FlagType,
  TicketProduct,
  Visit,
} from "@/lib/types";

interface VisitRow extends Visit {
  staff: { name: string; icon_emoji: string } | null;
  visit_menus: { menus: { name: string } | null }[];
  visit_photos: { id: number; kind: string; storage_path: string }[];
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const customerId = Number(id);
  const { stores, storeName, isAdmin } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [flags, setFlags] = useState<CustomerFlag[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [flagTypes, setFlagTypes] = useState<FlagType[]>([]);
  const [products, setProducts] = useState<TicketProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, f, n, t, v, ft, tp] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
      supabase
        .from("customer_flags")
        .select("*, flag_types (*)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_notes")
        .select("*")
        .eq("customer_id", customerId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_tickets")
        .select("*, ticket_products (*)")
        .eq("customer_id", customerId)
        .order("expires_at"),
      supabase
        .from("visits")
        .select(
          "*, staff (name, icon_emoji), visit_menus (menus (name)), visit_photos (id, kind, storage_path)"
        )
        .eq("customer_id", customerId)
        .order("scheduled_at", { ascending: false })
        .limit(50),
      supabase.from("flag_types").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("ticket_products").select("*").eq("is_active", true).order("sort_order"),
    ]);

    setCustomer((c.data as Customer) ?? null);
    setFlags((f.data as CustomerFlag[]) ?? []);
    setNotes((n.data as CustomerNote[]) ?? []);
    setTickets((t.data as CustomerTicket[]) ?? []);
    const visitRows = (v.data as unknown as VisitRow[]) ?? [];
    setVisits(visitRows);
    setFlagTypes((ft.data as FlagType[]) ?? []);
    setProducts((tp.data as TicketProduct[]) ?? []);
    setLoading(false);

    // 写真サムネイル（署名URLをまとめて発行）
    const paths = visitRows.flatMap((row) => row.visit_photos.map((p) => p.storage_path));
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("visit-photos")
        .createSignedUrls(paths, 60 * 60);
      const map: Record<string, string> = {};
      signed?.forEach((s) => {
        if (s.signedUrl && s.path) map[s.path] = s.signedUrl;
      });
      setThumbs(map);
    }
  }, [supabase, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ListSkeleton rows={6} />;
  if (!customer) {
    return <p className="text-muted py-12 text-center">お客様が見つかりません</p>;
  }

  const activeFlags = flags.filter((f) => !f.resolved_at);
  const filledVisits = visits.filter((v) => v.status === "filled");
  const lastVisit = filledVisits[0];

  return (
    <div className="max-w-3xl mx-auto space-y-5 fade-in">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">{customer.name} 様</h1>
          <p className="text-sm text-muted mt-1">
            {customer.kana}
            {customer.phone && ` ・ ${customer.phone}`} ・ 主担当{" "}
            {storeName(customer.primary_store_id)}
          </p>
          <p className="text-xs text-muted mt-1 tnum">
            ご来店 {filledVisits.length} 回
            {lastVisit && ` ・ 最終来店 ${dateSlash(lastVisit.scheduled_at)}`}
            {customer.first_visit_on && ` ・ 初回 ${dateSlash(customer.first_visit_on)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {customer.line_chat_url && (
            <a href={customer.line_chat_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">LINEを開く</Button>
            </a>
          )}
          <Link href={`/visits/new?customer=${customer.id}&date=${todayJST()}`}>
            <Button>来店予定を作る</Button>
          </Link>
        </div>
      </div>

      {/* 注意フラグ・申し送り（最上部） */}
      <FlagAndNoteSection
        customerId={customerId}
        activeFlags={activeFlags}
        notes={notes}
        flagTypes={flagTypes}
        bookingMemo={customer.booking_memo}
        onChanged={load}
      />

      {/* 保有回数券 */}
      <TicketSection
        customerId={customerId}
        tickets={tickets}
        products={products}
        defaultStoreId={customer.primary_store_id ?? stores[0]?.id ?? null}
        onChanged={load}
      />

      {/* カウンセリング・同意書（電子化） */}
      <CustomerDocuments customerId={customerId} lineChatUrl={customer.line_chat_url} />

      {/* 来店履歴タイムライン */}
      <Card className="p-4 space-y-3">
        <SectionTitle>来店履歴</SectionTitle>
        {visits.length === 0 ? (
          <p className="text-sm text-muted">まだ来店記録がありません</p>
        ) : (
          <ul className="relative space-y-0 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-hairline">
            {visits.map((v) => (
              <li key={v.id} className="relative pl-6 py-2.5">
                <span
                  className={`absolute left-0 top-4 w-[15px] h-[15px] rounded-full border-2 ${
                    v.status === "filled"
                      ? "bg-gold-soft border-gold"
                      : "bg-warn-soft border-warn"
                  }`}
                  aria-hidden
                />
                <Link href={`/visits/${v.id}`} className="block group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink tnum group-hover:text-gold-dk transition-colors">
                      {dateSlash(v.scheduled_at)} {timeHM(v.scheduled_at)}
                    </span>
                    {v.status === "scheduled" ? (
                      <Badge color="warn">未記入</Badge>
                    ) : null}
                    {v.staff && (
                      <span className="text-xs text-muted">
                        {v.staff.icon_emoji} {v.staff.name}
                      </span>
                    )}
                  </div>
                  {v.visit_menus.length > 0 && (
                    <p className="text-xs text-muted mt-0.5">
                      {v.visit_menus.map((m) => m.menus?.name).filter(Boolean).join("・")}
                    </p>
                  )}
                  {v.important_memo && (
                    <p className="text-xs text-rose mt-0.5">📌 {v.important_memo}</p>
                  )}
                  {v.visit_photos.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {v.visit_photos.slice(0, 4).map((p) =>
                        thumbs[p.storage_path] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={p.id}
                            src={thumbs[p.storage_path]}
                            alt={p.kind === "before" ? "施術前" : "施術後"}
                            className="w-12 h-12 rounded-lg object-cover border border-hairline"
                          />
                        ) : null
                      )}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 基本情報の編集 */}
      <BasicInfoSection customer={customer} stores={stores} isAdmin={isAdmin} onChanged={load} />
    </div>
  );
}

/* ================= フラグ・申し送り ================= */
function FlagAndNoteSection({
  customerId,
  activeFlags,
  notes,
  flagTypes,
  bookingMemo,
  onChanged,
}: {
  customerId: number;
  activeFlags: CustomerFlag[];
  notes: CustomerNote[];
  flagTypes: FlagType[];
  bookingMemo: string | null;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [adding, setAdding] = useState(false);
  const [newFlagType, setNewFlagType] = useState<number | null>(null);
  const [newFlagNote, setNewFlagNote] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newNotePinned, setNewNotePinned] = useState(true);
  const [busy, setBusy] = useState(false);

  const hasAlert = activeFlags.length > 0 || notes.some((n) => n.pinned);

  async function addFlag() {
    if (!newFlagType) return;
    setBusy(true);
    await supabase.from("customer_flags").insert({
      customer_id: customerId,
      flag_type_id: newFlagType,
      note: newFlagNote.trim() || null,
    });
    setNewFlagType(null);
    setNewFlagNote("");
    await onChanged();
    setBusy(false);
  }

  async function resolveFlag(flagId: number) {
    setBusy(true);
    await supabase
      .from("customer_flags")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", flagId);
    await onChanged();
    setBusy(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setBusy(true);
    await supabase.from("customer_notes").insert({
      customer_id: customerId,
      body: newNote.trim(),
      pinned: newNotePinned,
    });
    setNewNote("");
    await onChanged();
    setBusy(false);
  }

  async function togglePin(note: CustomerNote) {
    setBusy(true);
    await supabase.from("customer_notes").update({ pinned: !note.pinned }).eq("id", note.id);
    await onChanged();
    setBusy(false);
  }

  return (
    <Card
      className={`p-4 space-y-3 ${hasAlert ? "border-caution/40 bg-caution-soft/30" : ""}`}
      hairline={!hasAlert}
    >
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">注意フラグ・申し送り</SectionTitle>
        <Button variant="ghost" onClick={() => setAdding(!adding)}>
          {adding ? "閉じる" : "＋ 追加"}
        </Button>
      </div>

      {/* フラグ */}
      {activeFlags.length > 0 && (
        <div className="space-y-2">
          {activeFlags.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <FlagBadges flags={[f]} />
                {f.note && <p className="text-sm text-caution font-medium">⚠ {f.note}</p>}
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => resolveFlag(f.id)}>
                解除
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 申し送りメモ */}
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2">
              <p className={`text-sm ${n.pinned ? "text-ink font-medium" : "text-muted"}`}>
                {n.pinned && "📌 "}
                {n.body}
                <span className="ml-2 text-xs text-muted tnum">{dateSlash(n.created_at)}</span>
              </p>
              <Button variant="ghost" disabled={busy} onClick={() => togglePin(n)}>
                {n.pinned ? "ピン解除" : "ピン留め"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {bookingMemo && <p className="text-sm text-muted">予約メモ：{bookingMemo}</p>}

      {activeFlags.length === 0 && notes.length === 0 && !bookingMemo && (
        <p className="text-sm text-muted">フラグ・申し送りはありません</p>
      )}

      {/* 追加フォーム */}
      {adding && (
        <div className="rounded-xl border border-hairline bg-surface p-3 space-y-3 fade-in">
          <p className="text-xs font-semibold text-muted">フラグを立てる</p>
          <div className="flex gap-2 flex-wrap">
            {flagTypes.map((ft) => (
              <Chip
                key={ft.id}
                label={ft.name}
                selected={newFlagType === ft.id}
                onClick={() => setNewFlagType(newFlagType === ft.id ? null : ft.id)}
              />
            ))}
          </div>
          {newFlagType && (
            <>
              <TextField
                label="フラグの補足（任意）"
                value={newFlagNote}
                onChange={(e) => setNewFlagNote(e.target.value)}
              />
              <Button disabled={busy} onClick={addFlag}>
                フラグを追加
              </Button>
            </>
          )}

          <div className="ornament-divider text-[8px]">◆</div>

          <p className="text-xs font-semibold text-muted">申し送りメモを書く</p>
          <TextArea
            label="本文"
            rows={2}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Chip
              label="📌 ピン留めする"
              selected={newNotePinned}
              onClick={() => setNewNotePinned(!newNotePinned)}
            />
            <Button disabled={busy || !newNote.trim()} onClick={addNote}>
              メモを追加
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ================= 回数券 ================= */
function TicketSection({
  customerId,
  tickets,
  products,
  defaultStoreId,
  onChanged,
}: {
  customerId: number;
  tickets: CustomerTicket[];
  products: TicketProduct[];
  defaultStoreId: number | null;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { stores } = useApp();
  const [selling, setSelling] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId);
  const [busy, setBusy] = useState(false);

  const totalUnused = tickets
    .filter((t) => daysUntil(t.expires_at) >= 0)
    .reduce((sum, t) => sum + ticketUnusedAmount(t), 0);

  async function sellTicket() {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setBusy(true);
    await supabase.from("customer_tickets").insert({
      customer_id: customerId,
      product_id: product.id,
      store_id: storeId,
      purchased_at: todayJST(),
      expires_at: addDays(todayJST(), product.valid_days),
      total_count: product.total_count,
      remaining_count: product.total_count,
      price: product.price,
    });
    setSelling(false);
    setProductId(null);
    await onChanged();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">保有回数券</SectionTitle>
        <Button variant="ghost" onClick={() => setSelling(!selling)}>
          {selling ? "閉じる" : "＋ 販売を登録"}
        </Button>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-muted">保有中の回数券はありません</p>
      ) : (
        <>
          <ul className="space-y-2">
            {tickets.map((t) => {
              const days = daysUntil(t.expires_at);
              const expired = days < 0;
              const exhausted = t.remaining_count === 0;
              return (
                <li
                  key={t.id}
                  className={`rounded-xl border px-4 py-3 ${
                    expired || exhausted
                      ? "border-hairline bg-base opacity-60"
                      : days <= 30 || t.remaining_count === 1
                        ? "border-warn/50 bg-warn-soft/40"
                        : "border-hairline bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-ink">{ticketLabel(t)}</p>
                    <div className="flex gap-1.5">
                      {expired && <Badge color="caution">期限切れ</Badge>}
                      {!expired && days <= 30 && <Badge color="warn">期限あと{days}日</Badge>}
                      {!expired && t.remaining_count === 1 && <Badge color="rose">残り1回</Badge>}
                    </div>
                  </div>
                  <p className="text-sm text-muted mt-1 tnum">
                    残 {t.remaining_count}/{t.total_count} 回 ・ 未消化{" "}
                    {yen(ticketUnusedAmount(t))} ・ 期限 {dateSlash(t.expires_at)}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-right text-sm text-ink">
            未消化残高合計{" "}
            <span className="serif text-xl text-gold-dk tnum">{yen(totalUnused)}</span>
          </p>
        </>
      )}

      {selling && (
        <div className="rounded-xl border border-hairline bg-surface p-3 space-y-3 fade-in">
          <p className="text-xs font-semibold text-muted">商品を選択</p>
          <div className="flex gap-2 flex-wrap">
            {products.map((p) => (
              <Chip
                key={p.id}
                label={`${p.name} ${yen(p.price)}`}
                selected={productId === p.id}
                onClick={() => setProductId(p.id)}
              />
            ))}
          </div>
          <p className="text-xs font-semibold text-muted">販売店舗</p>
          <div className="flex gap-2 flex-wrap">
            {stores.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={storeId === s.id}
                onClick={() => setStoreId(s.id)}
              />
            ))}
          </div>
          <Button disabled={busy || !productId} onClick={sellTicket}>
            販売を登録する
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ================= 基本情報 ================= */
function BasicInfoSection({
  customer,
  stores,
  isAdmin,
  onChanged,
}: {
  customer: Customer;
  stores: { id: number; name: string }[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: customer.name,
    kana: customer.kana,
    phone: customer.phone,
    primary_store_id: customer.primary_store_id,
    line_chat_url: customer.line_chat_url ?? "",
    booking_memo: customer.booking_memo ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await supabase
      .from("customers")
      .update({
        name: form.name.trim(),
        kana: form.kana.trim(),
        phone: form.phone.trim(),
        primary_store_id: form.primary_store_id,
        line_chat_url: form.line_chat_url.trim() || null,
        booking_memo: form.booking_memo.trim() || null,
      })
      .eq("id", customer.id);
    setEditing(false);
    await onChanged();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">基本情報</SectionTitle>
        <Button variant="ghost" onClick={() => setEditing(!editing)}>
          {editing ? "閉じる" : "編集"}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-3 fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="お名前"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="カナ"
              value={form.kana}
              onChange={(e) => setForm({ ...form, kana: e.target.value })}
            />
            <TextField
              label="電話番号"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <TextField
              label="LINEチャットURL"
              type="url"
              placeholder="https://line.me/…"
              value={form.line_chat_url}
              onChange={(e) => setForm({ ...form, line_chat_url: e.target.value })}
            />
          </div>
          <p className="text-xs font-semibold text-muted">主担当店舗</p>
          <div className="flex gap-2 flex-wrap">
            {stores.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={form.primary_store_id === s.id}
                onClick={() => setForm({ ...form, primary_store_id: s.id })}
              />
            ))}
          </div>
          <TextArea
            label="予約メモ（サロンボードのメモ相当）"
            rows={2}
            value={form.booking_memo}
            onChange={(e) => setForm({ ...form, booking_memo: e.target.value })}
          />
          <Button disabled={busy} onClick={save}>
            保存する
          </Button>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <InfoRow label="カナ" value={customer.kana || "—"} />
          <InfoRow label="電話番号" value={customer.phone || "—"} />
          <InfoRow
            label="LINE"
            value={customer.line_chat_url ? "登録済み" : "未登録"}
          />
          <InfoRow label="予約メモ" value={customer.booking_memo || "—"} />
        </dl>
      )}
      {!isAdmin && (
        <p className="text-xs text-muted">※ お客様情報の削除は管理者のみ行えます</p>
      )}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-ink mt-0.5">{value}</dd>
    </div>
  );
}
