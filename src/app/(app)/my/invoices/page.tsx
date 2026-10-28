"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { useInbox } from "@/lib/inbox";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Chip, EmptyState, ListSkeleton, SectionTitle, TextField } from "@/components/ui";
import { addMonths, dateSlash, hoursLabel, monthLabelJa, thisMonthJST, yen } from "@/lib/format";
import type { ContractorInvoice, ContractorProfile, PayrollClosing } from "@/lib/types";

type ProfileForm = Record<keyof Omit<ContractorProfile, "staff_id">, string>;

const EMPTY_PROFILE: ProfileForm = {
  issuer_name: "",
  postal_code: "",
  address: "",
  phone: "",
  email: "",
  registration_number: "",
  bank_name: "",
  bank_branch: "",
  bank_account_type: "普通",
  bank_account_number: "",
  bank_account_holder: "",
};

interface WorkSummary {
  store_name: string;
  days: number;
  minutes: number;
  transport: number;
}

// 請求書（業務委託スタッフ）: 月締めが終わった月の請求書を作成 → 確認 → Gmail で送信
export default function MyInvoicesPage() {
  const { me } = useApp();
  const inbox = useInbox();
  const router = useRouter();
  const notify = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<ContractorProfile | null | undefined>(undefined);
  const [closings, setClosings] = useState<PayrollClosing[]>([]);
  const [invoices, setInvoices] = useState<ContractorInvoice[]>([]);
  const [preview, setPreview] = useState<{ month: string; rows: WorkSummary[] } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [pr, cl, iv] = await Promise.all([
      supabase.from("contractor_profiles").select("*").eq("staff_id", me.id).maybeSingle(),
      supabase.from("payroll_closings").select("*").order("month", { ascending: false }).limit(6),
      supabase.from("contractor_invoices").select("*").eq("staff_id", me.id).order("month", { ascending: false }),
    ]);
    setProfile((pr.data as ContractorProfile | null) ?? null);
    const closed = (cl.data as PayrollClosing[]) ?? [];
    setClosings(closed);
    setInvoices((iv.data as ContractorInvoice[]) ?? []);

    // まだ締めていない直近の月（前月か今月）の見込み
    const candidates = [addMonths(thisMonthJST(), -1), thisMonthJST()];
    const open = candidates.find((m) => !closed.some((c) => c.month === m));
    if (open) {
      const { data } = await supabase.rpc("contractor_work_summary", { p_staff_id: me.id, p_month: open });
      setPreview({ month: open, rows: (data as WorkSummary[]) ?? [] });
    } else {
      setPreview(null);
    }
  }, [supabase, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function issue(month: string) {
    setBusyMonth(month);
    const { data, error } = await supabase.rpc("issue_contractor_invoice", {
      p_month: month,
      p_note: notes[month] ?? null,
    });
    setBusyMonth(null);
    if (error || !data) {
      notify(error?.message ?? "請求書を作成できませんでした", "error");
      return;
    }
    inbox.refresh();
    router.push(`/invoices/${(data as ContractorInvoice).id}`);
  }

  if (me.employment_type !== "contractor") {
    return (
      <Card className="p-4 max-w-2xl mx-auto">
        <EmptyState message="請求書は業務委託のスタッフだけが作成できます" />
      </Card>
    );
  }

  const profileReady =
    !!profile && !!profile.issuer_name.trim() && !!profile.address?.trim() && !!profile.bank_account_number?.trim();

  return (
    <div className="max-w-2xl mx-auto space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">請求書</h1>
        <p className="text-sm text-muted mt-1">
          月締めが終わると、その月の稼働時間・時間単価・交通費から請求書が自動で作成されます。
          内容を確認して、Gmailで送るだけです
        </p>
      </div>

      {profile === undefined ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {(!profileReady || editingProfile) ? (
            <ProfileEditor
              initial={profile}
              staffId={me.id}
              onSaved={async () => {
                setEditingProfile(false);
                await load();
              }}
              onCancel={profileReady ? () => setEditingProfile(false) : undefined}
            />
          ) : (
            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">請求者情報</h2>
                <Button variant="ghost" onClick={() => setEditingProfile(true)}>
                  編集
                </Button>
              </div>
              <p className="text-sm text-ink">
                {profile!.issuer_name}
                <span className="block text-xs text-muted">
                  {profile!.postal_code && `〒${profile!.postal_code} `}
                  {profile!.address}
                </span>
                <span className="block text-xs text-muted">
                  振込先: {profile!.bank_name} {profile!.bank_branch} {profile!.bank_account_type} {profile!.bank_account_number}
                </span>
                {profile!.registration_number && (
                  <span className="block text-xs text-muted">登録番号: {profile!.registration_number}</span>
                )}
              </p>
            </Card>
          )}

          {/* 締め済みの月 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>月ごとの請求書</SectionTitle>
            {closings.length === 0 ? (
              <EmptyState message="まだ締めた月がありません。月締めが終わると、ここから請求書を作成できます" />
            ) : (
              <ul className="space-y-3">
                {closings.map((c) => {
                  const inv = invoices.find((i) => i.month === c.month);
                  return (
                    <li key={c.month} className="rounded-xl border border-hairline bg-base p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-ink">{monthLabelJa(c.month)}分</p>
                        {inv ? (
                          <Badge color={inv.sent_at ? "ok" : "gold"}>
                            {inv.sent_at ? `送信済み ${dateSlash(inv.sent_at).slice(5)}` : "未送信"}
                          </Badge>
                        ) : (
                          <Badge color="warn">未作成</Badge>
                        )}
                      </div>
                      {inv ? (
                        <>
                          <p className="text-sm text-ink tnum">
                            ご請求額 <span className="text-lg font-semibold">{yen(inv.total)}</span>
                            <span className="ml-2 text-xs text-muted">
                              {inv.work_days}日・{hoursLabel(inv.work_minutes)}
                            </span>
                          </p>
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="flex w-full items-center justify-center min-h-11 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors"
                          >
                            {inv.sent_at ? "請求書を見る" : "確認してGmailで送る"}
                          </Link>
                        </>
                      ) : profileReady ? (
                        <>
                          <TextField
                            label="備考（任意・請求書に記載）"
                            value={notes[c.month] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [c.month]: e.target.value }))}
                          />
                          <Button className="w-full" disabled={busyMonth !== null} onClick={() => issue(c.month)}>
                            {busyMonth === c.month ? "作成中…" : `${monthLabelJa(c.month)}分の請求書を作成`}
                          </Button>
                        </>
                      ) : (
                        <p className="text-xs text-warn">先に上の請求者情報を登録してください</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {preview && (
            <Card className="p-4 space-y-2">
              <h2 className="text-base font-semibold text-ink">
                {monthLabelJa(preview.month)}の稼働（締め前の見込み）
              </h2>
              {preview.rows.length === 0 ? (
                <p className="text-sm text-muted">確定シフトはまだありません</p>
              ) : (
                <ul className="text-sm text-ink space-y-1 tnum">
                  {preview.rows.map((r) => (
                    <li key={r.store_name} className="flex justify-between gap-2">
                      <span>{r.store_name}</span>
                      <span>
                        {r.days}日・{hoursLabel(r.minutes)}・交通費 {yen(r.transport)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">
                管理者が月締めをすると金額が確定し、請求書を作成できるようになります
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* 請求者情報（本人が登録。本人と管理者だけが閲覧できる） */
function ProfileEditor({
  initial,
  staffId,
  onSaved,
  onCancel,
}: {
  initial: ContractorProfile | null;
  staffId: number;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [form, setForm] = useState<ProfileForm>(() =>
    initial
      ? (Object.fromEntries(
          Object.keys(EMPTY_PROFILE).map((k) => [k, String(initial[k as keyof ContractorProfile] ?? "")])
        ) as ProfileForm)
      : EMPTY_PROFILE
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ProfileForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    const reg = form.registration_number.trim().toUpperCase().replace(/[^T0-9]/g, "");
    if (!form.issuer_name.trim() || !form.address.trim() || !form.bank_account_number.trim()) {
      setError("お名前・住所・口座番号は必須です");
      return;
    }
    if (reg && !/^T\d{13}$/.test(reg)) {
      setError("登録番号は「T」＋13桁の数字で入力してください（未登録なら空欄）");
      return;
    }
    setError(null);
    setBusy(true);
    const payload: Record<string, string | number | null> = { staff_id: staffId };
    for (const [k, v] of Object.entries(form)) payload[k] = v.trim() || null;
    payload.issuer_name = form.issuer_name.trim();
    payload.registration_number = reg || null;
    const { error: err } = await supabase.from("contractor_profiles").upsert(payload, { onConflict: "staff_id" });
    setBusy(false);
    if (err) {
      setError("保存できませんでした");
      return;
    }
    notify("請求者情報を保存しました");
    await onSaved();
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">請求者情報（はじめに1回だけ）</h2>
        <p className="text-xs text-muted mt-1">
          請求書に記載するあなたの情報です。本人と管理者だけが見られます。次の月からは入力不要です
        </p>
      </div>
      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <TextField label="お名前（屋号があれば屋号も）" autoComplete="name" value={form.issuer_name} onChange={set("issuer_name")} />
        </div>
        <TextField label="郵便番号" inputMode="numeric" autoComplete="postal-code" value={form.postal_code} onChange={set("postal_code")} />
        <TextField label="電話番号" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        <div className="sm:col-span-2">
          <TextField label="住所" autoComplete="street-address" value={form.address} onChange={set("address")} />
        </div>
        <div className="sm:col-span-2">
          <TextField label="メールアドレス" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </div>
        <div className="sm:col-span-2">
          <TextField
            label="適格請求書発行事業者の登録番号（任意・T＋13桁）"
            placeholder="T1234567890123"
            autoComplete="off"
            value={form.registration_number}
            onChange={set("registration_number")}
          />
        </div>
      </fieldset>
      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <legend className="text-xs font-semibold text-gold-dk mb-1">振込先</legend>
        <TextField label="銀行名" value={form.bank_name} onChange={set("bank_name")} />
        <TextField label="支店名" value={form.bank_branch} onChange={set("bank_branch")} />
        <div>
          <p className="text-xs font-semibold text-muted mb-1">口座種別</p>
          <div className="flex gap-2">
            {["普通", "当座"].map((t) => (
              <Chip key={t} label={t} selected={form.bank_account_type === t} onClick={() => setForm((f) => ({ ...f, bank_account_type: t }))} />
            ))}
          </div>
        </div>
        <TextField label="口座番号" inputMode="numeric" value={form.bank_account_number} onChange={set("bank_account_number")} />
        <div className="sm:col-span-2">
          <TextField label="口座名義（カナ）" value={form.bank_account_holder} onChange={set("bank_account_holder")} />
        </div>
      </fieldset>
      {error && <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存する"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        )}
      </div>
    </Card>
  );
}
