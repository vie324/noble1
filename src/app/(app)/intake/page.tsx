"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, EmptyState, ListSkeleton, SectionTitle } from "@/components/ui";
import { CounselingAnswers } from "@/components/counseling-answers";
import { dateTimeLabel } from "@/lib/format";
import type { Customer, CounselingSheet } from "@/lib/types";

// カウンセリング受付箱: LINE等の固定URLから届いた未紐付けの回答を確認し、
// 既存顧客への紐付け or 新規登録 を行い、そのままカルテを作成する。
export default function IntakePage() {
  const { storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [sheets, setSheets] = useState<CounselingSheet[] | null>(null);

  const load = useCallback(async () => {
    setSheets(null);
    const { data } = await supabase
      .from("counseling_sheets")
      .select("*")
      .is("customer_id", null)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    setSheets((data as CounselingSheet[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">カウンセリング受付</h1>
        <p className="text-sm text-muted mt-1">
          お客様がLINE等から送信した新着カウンセリングです。確認してお客様に紐付けてください。
        </p>
      </div>

      {sheets === null ? (
        <ListSkeleton rows={3} />
      ) : sheets.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="新着のカウンセリングはありません" />
        </Card>
      ) : (
        <ul className="space-y-4 stagger">
          {sheets.map((s) => (
            <IntakeCard key={s.id} sheet={s} storeName={storeName} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IntakeCard({
  sheet,
  storeName,
  onChanged,
}: {
  sheet: CounselingSheet;
  storeName: (id: number | null | undefined) => string;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { me, stores } = useApp();
  const [matching, setMatching] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 紐付け確定 → カルテ（来店記録）を作成して開く
  async function finalize(customerId: number) {
    setBusy(true);
    setError(null);
    try {
      const storeId =
        sheet.store_id ?? stores.find((x) => x.id === me.store_id)?.id ?? stores[0]?.id;
      const { data: visit, error: vErr } = await supabase
        .from("visits")
        .insert({
          customer_id: customerId,
          store_id: storeId,
          staff_id: me.id,
          scheduled_at: new Date().toISOString(),
          status: "scheduled",
        })
        .select("id")
        .single();
      if (vErr) throw vErr;

      const { error: uErr } = await supabase
        .from("counseling_sheets")
        .update({ customer_id: customerId, visit_id: visit.id })
        .eq("id", sheet.id);
      if (uErr) throw uErr;

      router.push(`/visits/${visit.id}`);
    } catch (e) {
      console.error(e);
      setError("処理に失敗しました。もう一度お試しください");
      setBusy(false);
    }
  }

  // 新規のお客様として登録 → カルテ作成
  async function registerNew() {
    setBusy(true);
    setError(null);
    try {
      const { data: customer, error: cErr } = await supabase
        .from("customers")
        .insert({
          name: sheet.applicant_name ?? "（名称未設定）",
          kana: sheet.applicant_kana ?? "",
          phone: sheet.applicant_phone ?? "",
          primary_store_id: sheet.store_id,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      await finalize(customer.id as number);
    } catch (e) {
      console.error(e);
      setError("登録に失敗しました");
      setBusy(false);
    }
  }

  // 既存顧客のインクリメンタル検索
  function runSearch(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const like = `%${q.trim()}%`;
      const { data } = await supabase
        .from("customers")
        .select("*")
        .or(`name.ilike.${like},kana.ilike.${like},phone.ilike.${like}`)
        .order("kana")
        .limit(8);
      setResults((data as Customer[]) ?? []);
    }, 200);
  }

  return (
    <li>
      <Card className="p-4 space-y-3 border-gold/50">
        {/* 申込者情報 */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="serif text-xl text-ink">{sheet.applicant_name} 様</span>
              <Badge color="warn">未紐付け</Badge>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {[sheet.applicant_kana, sheet.applicant_phone, storeName(sheet.store_id)]
                .filter(Boolean)
                .join(" ・ ")}
            </p>
            {sheet.submitted_at && (
              <p className="text-[11px] text-muted mt-0.5 tnum">
                送信 {dateTimeLabel(sheet.submitted_at)}
              </p>
            )}
          </div>
        </div>

        {/* 回答 */}
        <div className="rounded-xl bg-base border border-hairline p-3">
          <CounselingAnswers answers={sheet.answers ?? {}} />
        </div>

        {error && (
          <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
        )}

        {/* アクション */}
        {!matching ? (
          <div className="flex gap-2 flex-wrap">
            <Button disabled={busy} onClick={registerNew}>
              {busy ? "処理中…" : "新規登録してカルテ作成"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setMatching(true)}>
              既存のお客様に紐付け
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface p-3 space-y-2 fade-in">
            <SectionTitle>既存のお客様を選択</SectionTitle>
            <input
              type="text"
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="お名前・カナ・電話番号で検索"
              autoFocus
              className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
            />
            {results.length > 0 && (
              <ul className="rounded-xl border border-hairline divide-y divide-hairline overflow-hidden">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => finalize(c.id)}
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
            {search && results.length === 0 && (
              <p className="text-sm text-muted px-1">該当するお客様が見つかりません</p>
            )}
            <Button variant="ghost" onClick={() => setMatching(false)}>
              ← 戻る
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted">
          紐付けると、その内容でカルテ（来店記録）が作成され、編集画面が開きます。
        </p>
      </Card>
    </li>
  );
}
