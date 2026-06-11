"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { monthLabelJa, thisMonthJST, yen } from "@/lib/format";
import type { Staff } from "@/lib/types";

// スタッフ別実績（管理者専用 — スタッフ本人にも非公開。RLSでも遮断）
interface PerfRow {
  staff_id: number;
  month: string;
  sales: number;
  target_sales: number;
  nomination: number;
  retention_rate: number;
  review_score: number | null;
}

const FIELDS = [
  { key: "sales", label: "売上" },
  { key: "target_sales", label: "目標" },
  { key: "nomination", label: "指名数" },
  { key: "retention_rate", label: "リピート率%" },
] as const;

export default function StaffPerformancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [rows, setRows] = useState<PerfRow[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setDirty(false);
    const [st, pf] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("id"),
      supabase.from("staff_monthly").select("*").eq("month", month),
    ]);
    const staff = (st.data as Staff[]) ?? [];
    setStaffList(staff);
    const existing = new Map(((pf.data as PerfRow[]) ?? []).map((r) => [r.staff_id, r]));
    setRows(
      staff.map(
        (s) =>
          existing.get(s.id) ?? {
            staff_id: s.id,
            month,
            sales: 0,
            target_sales: 0,
            nomination: 0,
            retention_rate: 0,
            review_score: null,
          }
      )
    );
  }, [supabase, month]);

  useEffect(() => {
    load();
  }, [load]);

  function update(staffId: number, key: (typeof FIELDS)[number]["key"], value: number) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.staff_id === staffId ? { ...r, [key]: value } : r)) : prev
    );
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    const payload = rows.filter(
      (r) => r.sales || r.target_sales || r.nomination || r.retention_rate
    );
    const { error } = await supabase
      .from("staff_monthly")
      .upsert(payload, { onConflict: "staff_id,month" });
    setMessage(error ? "保存に失敗しました" : "保存しました");
    if (!error) setDirty(false);
    setSaving(false);
  }

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">スタッフ実績</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabelJa(month)} ・ 管理者専用（スタッフには表示されません）
          </p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {rows === null ? (
        <ListSkeleton rows={4} />
      ) : (
        <Card className="p-4 space-y-4">
          <SectionTitle>月次実績・目標</SectionTitle>
          <ul className="space-y-4">
            {rows.map((r) => {
              const staff = staffList.find((s) => s.id === r.staff_id);
              const rate = r.target_sales > 0 ? (r.sales / r.target_sales) * 100 : 0;
              return (
                <li key={r.staff_id} className="rounded-xl border border-hairline p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-ink">
                      {staff?.icon_emoji} {staff?.name}
                      <span className="ml-2 text-xs text-muted font-normal">
                        達成率{" "}
                        <span
                          className={`tnum font-semibold ${
                            rate >= 100 ? "text-ok" : rate >= 70 ? "text-warn" : "text-caution"
                          }`}
                        >
                          {r.target_sales > 0 ? `${rate.toFixed(0)}%` : "—"}
                        </span>
                      </span>
                    </p>
                    <p className="text-xs text-muted tnum">
                      {yen(r.sales)} / {yen(r.target_sales)}
                    </p>
                  </div>
                  {/* 達成率バー */}
                  <div className="h-2 rounded-full bg-base border border-hairline overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, rate)}%`,
                        background:
                          rate >= 100
                            ? "var(--noble-ok)"
                            : "linear-gradient(to right, var(--noble-gold), var(--noble-gold-dk))",
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FIELDS.map((f) => (
                      <label key={f.key} className="block">
                        <span className="block text-[11px] font-semibold text-muted mb-0.5">
                          {f.label}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={r[f.key] || ""}
                          placeholder="0"
                          onChange={(e) => update(r.staff_id, f.key, Number(e.target.value || 0))}
                          className="w-full min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
                        />
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "保存中…" : "保存する"}
            </Button>
            {message && (
              <span className={`text-sm ${message.includes("失敗") ? "text-caution" : "text-ok"}`}>
                {message}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
