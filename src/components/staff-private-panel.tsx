"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Chip, TextArea, TextField } from "@/components/ui";
import { useToast } from "@/components/toast";
import { dateSlash, todayJST } from "@/lib/format";
import type { StaffPrivate } from "@/lib/types";

type Form = Record<keyof Omit<StaffPrivate, "staff_id">, string>;

const EMPTY: Form = {
  birth_date: "",
  postal_code: "",
  address: "",
  nearest_station: "",
  commute_route: "",
  personal_phone: "",
  personal_email: "",
  emergency_name: "",
  emergency_relation: "",
  emergency_phone: "",
  joined_on: "",
  bank_name: "",
  bank_branch: "",
  bank_account_type: "",
  bank_account_number: "",
  bank_account_holder: "",
  memo: "",
};

// 満年齢（東京時間の今日基準）
export function ageOf(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const [ty, tm, td] = todayJST().split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

// マスタ管理 > スタッフ: 個人情報（管理者のみ。RLS で管理者以外は読み書きできない）
export function StaffPrivatePanel({ staffId, staffName }: { staffId: number; staffName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [row, setRow] = useState<StaffPrivate | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("staff_private")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (err) {
      setError("個人情報を読み込めませんでした（027_staff_private.sql が未実行の可能性があります）");
      setRow(null);
      return;
    }
    const r = (data as StaffPrivate | null) ?? null;
    setRow(r);
    setForm(
      r
        ? (Object.fromEntries(
            Object.keys(EMPTY).map((k) => [k, String(r[k as keyof StaffPrivate] ?? "")])
          ) as Form)
        : EMPTY
    );
    if (!r) setEditing(true);
  }, [supabase, staffId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError(null);
    const payload: Record<string, string | number | null> = { staff_id: staffId };
    for (const [k, v] of Object.entries(form)) payload[k] = v.trim() === "" ? null : v.trim();
    const { error: err } = await supabase
      .from("staff_private")
      .upsert(payload, { onConflict: "staff_id" });
    setBusy(false);
    if (err) {
      setError("保存に失敗しました（日付の形式などを確認してください）");
      return;
    }
    notify(`${staffName}さんの個人情報を保存しました`);
    setEditing(false);
    await load();
  }

  if (row === undefined) {
    return <p className="text-sm text-muted py-2">読み込み中…</p>;
  }

  const age = ageOf(row?.birth_date);

  return (
    <div className="rounded-xl border border-gold/40 bg-gold-soft/25 p-3 space-y-3 fade-in">
      <p className="text-xs text-gold-dk font-semibold">
        🔒 管理者だけが閲覧・編集できます（本人を含むスタッフの画面には表示されません）
      </p>

      {!editing && row ? (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Item label="生年月日">
              {row.birth_date ? `${dateSlash(row.birth_date)}（${age}歳）` : "—"}
            </Item>
            <Item label="入社日・契約開始日">{row.joined_on ? dateSlash(row.joined_on) : "—"}</Item>
            <Item label="住所" wide>
              {row.postal_code && `〒${row.postal_code} `}
              {row.address || "—"}
            </Item>
            <Item label="最寄り駅">{row.nearest_station || "—"}</Item>
            <Item label="通勤経路">{row.commute_route || "—"}</Item>
            <Item label="電話">
              {row.personal_phone ? (
                <a href={`tel:${row.personal_phone}`} className="text-gold-dk underline underline-offset-2">
                  {row.personal_phone}
                </a>
              ) : (
                "—"
              )}
            </Item>
            <Item label="メール">{row.personal_email || "—"}</Item>
            <Item label="緊急連絡先" wide>
              {row.emergency_name
                ? `${row.emergency_name}${row.emergency_relation ? `（${row.emergency_relation}）` : ""} ${row.emergency_phone ?? ""}`
                : "—"}
            </Item>
            <Item label="振込先" wide>
              {row.bank_name
                ? `${row.bank_name} ${row.bank_branch ?? ""} ${row.bank_account_type ?? ""} ${row.bank_account_number ?? ""} ${row.bank_account_holder ?? ""}`
                : "—"}
            </Item>
            {row.memo && (
              <Item label="メモ" wide>
                <span className="whitespace-pre-wrap">{row.memo}</span>
              </Item>
            )}
          </dl>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            個人情報を編集
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <Group title="基本">
            <TextField label="生年月日" type="date" value={form.birth_date} onChange={set("birth_date")} />
            <TextField label="入社日・契約開始日" type="date" value={form.joined_on} onChange={set("joined_on")} />
          </Group>
          <Group title="住所・通勤">
            <TextField
              label="郵便番号"
              inputMode="numeric"
              autoComplete="off"
              placeholder="160-0022"
              value={form.postal_code}
              onChange={set("postal_code")}
            />
            <TextField label="最寄り駅" placeholder="新宿三丁目駅" value={form.nearest_station} onChange={set("nearest_station")} />
            <div className="sm:col-span-2">
              <TextField label="住所" autoComplete="off" value={form.address} onChange={set("address")} />
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="通勤経路（交通費の根拠）"
                placeholder="例: 中野駅 → 新宿駅（JR中央線）往復 420円"
                value={form.commute_route}
                onChange={set("commute_route")}
              />
            </div>
          </Group>
          <Group title="連絡先">
            <TextField label="電話番号" type="tel" inputMode="tel" autoComplete="off" value={form.personal_phone} onChange={set("personal_phone")} />
            <TextField label="メールアドレス" type="email" autoComplete="off" value={form.personal_email} onChange={set("personal_email")} />
            <TextField label="緊急連絡先（氏名）" value={form.emergency_name} onChange={set("emergency_name")} />
            <TextField label="続柄" placeholder="母" value={form.emergency_relation} onChange={set("emergency_relation")} />
            <TextField label="緊急連絡先（電話）" type="tel" inputMode="tel" value={form.emergency_phone} onChange={set("emergency_phone")} />
          </Group>
          <Group title="給与・報酬の振込先">
            <TextField label="銀行名" value={form.bank_name} onChange={set("bank_name")} />
            <TextField label="支店名" value={form.bank_branch} onChange={set("bank_branch")} />
            <div>
              <p className="text-xs font-semibold text-muted mb-1">口座種別</p>
              <div className="flex gap-2">
                {["普通", "当座"].map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={form.bank_account_type === t}
                    onClick={() =>
                      setForm((f) => ({ ...f, bank_account_type: f.bank_account_type === t ? "" : t }))
                    }
                  />
                ))}
              </div>
            </div>
            <TextField label="口座番号" inputMode="numeric" value={form.bank_account_number} onChange={set("bank_account_number")} />
            <div className="sm:col-span-2">
              <TextField label="口座名義（カナ）" value={form.bank_account_holder} onChange={set("bank_account_holder")} />
            </div>
          </Group>
          <TextArea label="メモ（資格・面談記録など）" rows={3} value={form.memo} onChange={set("memo")} />
          {error && (
            <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "保存中…" : "個人情報を保存"}
            </Button>
            {row && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                キャンセル
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            マイナンバーは法令上の厳格な管理が必要なため、このシステムには入力しないでください。
          </p>
        </div>
      )}
      {!editing && error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-gold-dk mb-1">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

function Item({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="text-ink break-words">{children}</dd>
    </div>
  );
}
