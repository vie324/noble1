"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, Chip, SectionTitle, TextField } from "@/components/ui";
import { dateLabelJa, jstToISO, todayJST, staffLabel } from "@/lib/format";
import type { Customer, Menu, Staff } from "@/lib/types";

export default function NewVisitPage() {
  return (
    <Suspense>
      <NewVisitForm />
    </Suspense>
  );
}

// 30分刻みの営業時間チップ
const TIME_CHIPS = Array.from({ length: 20 }, (_, i) => {
  const h = 10 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function NewVisitForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, stores, storeFilter } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const date = params.get("date") ?? todayJST();
  const presetCustomerId = params.get("customer");

  // ステップ1: 顧客
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", kana: "", phone: "" });

  // ステップ2: 時間・店舗・担当・メニュー
  const [time, setTime] = useState("10:00");
  const [storeId, setStoreId] = useState<number>(storeFilter ?? me.store_id ?? stores[0]?.id);
  const [staffId, setStaffId] = useState<number | null>(me.id);
  const [menuIds, setMenuIds] = useState<number[]>([]);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // マスタ読み込み
  useEffect(() => {
    (async () => {
      const [{ data: staff }, { data: menuData }] = await Promise.all([
        supabase.from("staff").select("*").eq("is_active", true).order("id"),
        supabase.from("menus").select("*").eq("is_active", true).order("sort_order"),
      ]);
      setStaffList((staff as Staff[]) ?? []);
      setMenus((menuData as Menu[]) ?? []);
    })();
  }, [supabase]);

  // URL で顧客指定があれば取得（顧客ページの「来店予定を作る」から）
  useEffect(() => {
    if (!presetCustomerId) return;
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", Number(presetCustomerId))
        .maybeSingle();
      if (data) selectCustomer(data as Customer);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCustomerId, supabase]);

  // インクリメンタルサーチ（名前／カナ／電話の部分一致）
  const runSearch = useCallback(
    (q: string) => {
      setSearch(q);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (q.trim().length === 0) {
        setResults([]);
        return;
      }
      setSearching(true);
      searchTimer.current = setTimeout(async () => {
        const like = `%${q.trim()}%`;
        const { data } = await supabase
          .from("customers")
          .select("*")
          .or(`name.ilike.${like},kana.ilike.${like},phone.ilike.${like}`)
          .order("kana")
          .limit(8);
        setResults((data as Customer[]) ?? []);
        setSearching(false);
      }, 200);
    },
    [supabase]
  );

  function selectCustomer(c: Customer) {
    setCustomer(c);
    setResults([]);
    setSearch("");
    if (c.primary_store_id && storeFilter === null) setStoreId(c.primary_store_id);
  }

  const availableMenus = menus.filter(
    (m) => m.store_ids.length === 0 || m.store_ids.includes(storeId)
  );

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      let customerId = customer?.id;

      // 新規顧客は最低限（名前・カナ・電話）だけで登録して箱を作る
      if (!customerId) {
        if (!newCustomer.name.trim()) {
          setError("お客様を選択するか、新規のお名前を入力してください");
          setSaving(false);
          return;
        }
        const { data, error: insErr } = await supabase
          .from("customers")
          .insert({
            name: newCustomer.name.trim(),
            kana: newCustomer.kana.trim(),
            phone: newCustomer.phone.trim(),
            primary_store_id: storeId,
            first_visit_on: date,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        customerId = data.id as number;
      }

      const { data: visit, error: visitErr } = await supabase
        .from("visits")
        .insert({
          customer_id: customerId,
          store_id: storeId,
          staff_id: staffId,
          scheduled_at: jstToISO(date, time),
          status: "scheduled",
        })
        .select("id")
        .single();
      if (visitErr) throw visitErr;

      if (menuIds.length > 0) {
        const { error: menuErr } = await supabase
          .from("visit_menus")
          .insert(menuIds.map((menu_id) => ({ visit_id: visit.id, menu_id })));
        if (menuErr) throw menuErr;
      }

      router.push("/");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。もう一度お試しください");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">来店予定を作る</h1>
        <p className="text-sm text-muted mt-1">{dateLabelJa(date)} の空カルテを作成します</p>
      </div>

      {/* お客様 */}
      <Card className="p-4 space-y-3">
        <SectionTitle>お客様</SectionTitle>
        {customer ? (
          <div className="flex items-center justify-between rounded-xl bg-gold-soft border border-gold/40 px-4 py-3">
            <div>
              <p className="font-semibold text-ink">{customer.name} 様</p>
              <p className="text-xs text-muted">
                {customer.kana} {customer.phone && `・${customer.phone}`}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setCustomer(null)}>
              変更
            </Button>
          </div>
        ) : showNewCustomer ? (
          <div className="space-y-3">
            <TextField
              label="お名前（必須）"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="カナ"
                value={newCustomer.kana}
                onChange={(e) => setNewCustomer({ ...newCustomer, kana: e.target.value })}
              />
              <TextField
                label="電話番号"
                type="tel"
                inputMode="tel"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
            <Button variant="ghost" onClick={() => setShowNewCustomer(false)}>
              ← 既存のお客様を検索する
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <TextField
              label="お名前・カナ・電話番号で検索"
              placeholder="例: ヤマダ / 090…"
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              autoFocus
            />
            {searching && <p className="text-xs text-muted">検索中…</p>}
            {results.length > 0 && (
              <ul className="rounded-xl border border-hairline divide-y divide-hairline overflow-hidden">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full min-h-12 px-4 py-2 text-left hover:bg-gold-soft transition-colors"
                    >
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {c.kana} {c.phone && `・${c.phone}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {search && !searching && results.length === 0 && (
              <p className="text-sm text-muted px-1">該当するお客様が見つかりません</p>
            )}
            <Button variant="ghost" onClick={() => setShowNewCustomer(true)}>
              ＋ 新規のお客様として登録
            </Button>
          </div>
        )}
      </Card>

      {/* 時間・店舗・担当 */}
      <Card className="p-4 space-y-4">
        <SectionTitle>ご来店時間</SectionTitle>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {TIME_CHIPS.map((t) => (
            <Chip key={t} label={t} selected={time === t} onClick={() => setTime(t)} />
          ))}
        </div>
        <input
          type="time"
          value={time}
          onChange={(e) => e.target.value && setTime(e.target.value)}
          className="min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-gold"
          aria-label="時刻を直接指定"
        />

        <SectionTitle>店舗</SectionTitle>
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

      {/* 予定メニュー */}
      <Card className="p-4 space-y-3">
        <SectionTitle>予定メニュー（任意）</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {availableMenus.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              selected={menuIds.includes(m.id)}
              onClick={() =>
                setMenuIds(
                  menuIds.includes(m.id)
                    ? menuIds.filter((id) => id !== m.id)
                    : [...menuIds, m.id]
                )
              }
            />
          ))}
        </div>
      </Card>

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={saving} className="flex-1">
          {saving ? "作成中…" : "この内容で箱を作る"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
