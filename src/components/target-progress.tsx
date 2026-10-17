"use client";

import Link from "next/link";
import {
  Bar,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Chip, SectionTitle } from "@/components/ui";
import {
  addMonths,
  fiscalYearLabel,
  fiscalYearStart,
  monthLabelJa,
  thisMonthJST,
  todayJST,
  yen,
} from "@/lib/format";
import { usesSalonOne } from "@/lib/types";
import type { Store, StoreMonthlyActual, StoreMonthlyTarget } from "@/lib/types";

// ============================================================
// 経営サマリーの「目標達成状況」
//   目標 = store_monthly_targets（経営 > 目標設定 で入力）
//   実績 = store_monthly_actuals（ビュー。店舗ごとの切替月以降はサロンワン、それより前は Noble）
// ============================================================

// 売上実績の基準: 入金ベース（キャッシュイン）／会計上（役務消化込）
export type SalesBasis = "cash" | "accounting";

const BASIS_LABEL: Record<SalesBasis, string> = {
  cash: "入金ベース",
  accounting: "会計上（消化）",
};

interface Figures {
  targetSales: number;
  targetNew: number;
  sales: number;
  newCustomers: number;
}

const ZERO: Figures = { targetSales: 0, targetNew: 0, sales: 0, newCustomers: 0 };

const addFigures = (a: Figures, b: Figures): Figures => ({
  targetSales: a.targetSales + b.targetSales,
  targetNew: a.targetNew + b.targetNew,
  sales: a.sales + b.sales,
  newCustomers: a.newCustomers + b.newCustomers,
});

// 指定店舗の、ある月の目標・実績の合計
function sumFigures(
  storeIds: number[],
  month: string,
  targets: StoreMonthlyTarget[],
  actuals: StoreMonthlyActual[],
  basis: SalesBasis
): Figures {
  const f = { ...ZERO };
  for (const t of targets) {
    if (t.month !== month || !storeIds.includes(t.store_id)) continue;
    f.targetSales += t.target_sales;
    f.targetNew += t.target_new_customers;
  }
  for (const a of actuals) {
    if (a.month !== month || !storeIds.includes(a.store_id)) continue;
    f.sales += basis === "cash" ? a.cash_in : a.accounting_sales;
    f.newCustomers += a.new_customers;
  }
  return f;
}

type MonthPhase = "past" | "current" | "future";

function monthPhase(month: string): MonthPhase {
  const current = thisMonthJST();
  return month < current ? "past" : month === current ? "current" : "future";
}

// 当月のみ: 経過日数ぶんの目安（%）と残り日数（今日を含む）
function currentMonthPace(month: string): { pace: number; remainingDays: number } | null {
  if (month !== thisMonthJST()) return null;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = Number(todayJST().slice(8, 10));
  return { pace: (today / days) * 100, remainingDays: days - today + 1 };
}

// 達成率の色: 当月は目安ペースとの比較、過去月は 100% / 70% で判定
function rateTone(rate: number, phase: MonthPhase, pace: number | null): string {
  if (phase === "future") return "text-muted";
  if (rate >= 100) return "text-ok";
  if (phase === "current") return pace !== null && rate >= pace ? "text-ok" : "text-warn";
  return rate >= 70 ? "text-warn" : "text-caution";
}

const monthNo = (monthFirst: string) => Number(monthFirst.slice(5, 7));
const count = (n: number) => `${n.toLocaleString("ja-JP")}件`;
const rateText = (actual: number, target: number) =>
  target > 0 ? `${((actual / target) * 100).toFixed(0)}%` : "—";

export function TargetProgress({
  month,
  stores,
  targets,
  actuals,
  basis,
  onBasisChange,
  sync,
}: {
  month: string; // 選択中の月（月初日）
  stores: Store[]; // 表示対象の店舗（ヘッダーの店舗切替で絞り込み済み）
  targets: StoreMonthlyTarget[]; // 選択月の年度分
  actuals: StoreMonthlyActual[]; // 選択月の年度分
  basis: SalesBasis;
  onBasisChange: (b: SalesBasis) => void;
  sync?: React.ReactNode; // サロンワンの取り込みボタン
}) {
  const fyStart = fiscalYearStart(month);

  // この年度に目標がある店舗だけで比較する（目標未設定の店舗は合計にも含めない）
  const targetStores = stores.filter((s) =>
    targets.some(
      (t) => t.store_id === s.id && (t.target_sales > 0 || t.target_new_customers > 0)
    )
  );
  const unsetStores = stores.filter((s) => !targetStores.includes(s));

  if (targetStores.length === 0) {
    return (
      <Card className="p-4 space-y-2">
        <SectionTitle>目標達成状況</SectionTitle>
        <p className="text-sm text-muted">
          {fiscalYearLabel(fyStart)}の目標が未設定です。
          <Link href="/admin/targets" className="text-gold-dk underline underline-offset-2">
            目標設定
          </Link>
          から入力すると、ここに実績との比較が表示されます
        </p>
      </Card>
    );
  }

  const ids = targetStores.map((s) => s.id);
  const totalLabel = `合計（${targetStores.map((s) => s.name).join("・")}）`;
  const phase = monthPhase(month);
  const pace = currentMonthPace(month);
  // 選択月の実績の取得元（店舗ごとの切替月で決まる）
  const salonOneStores = targetStores.filter((s) => usesSalonOne(s, month));
  const nobleStores = targetStores.filter((s) => !usesSalonOne(s, month));
  const mixed = salonOneStores.length > 0 && nobleStores.length > 0;
  const names = (list: Store[]) => list.map((s) => s.name).join("・");
  const switchMonths = targetStores.filter((s) => s.salonone_shop_id != null && s.salonone_from);

  const monthRows = [
    ...(targetStores.length >= 2
      ? [{ key: "total", label: totalLabel, f: sumFigures(ids, month, targets, actuals, basis) }]
      : []),
    ...targetStores.map((s) => ({
      key: String(s.id),
      label: s.name,
      f: sumFigures([s.id], month, targets, actuals, basis),
    })),
  ];

  // 年度の推移（目標がある店舗の合計）
  const series = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(fyStart, i);
    return { month: m, phase: monthPhase(m), f: sumFigures(ids, m, targets, actuals, basis) };
  });
  // 累計は「年度初め〜選択月」。ただし未来の月（実績がまだない月）は含めない
  const cutoff = phase === "future" ? thisMonthJST() : month;
  const elapsed = series.filter((r) => r.month <= cutoff);
  const toDate = elapsed.reduce((a, r) => addFigures(a, r.f), ZERO);
  const lastElapsed = elapsed[elapsed.length - 1]?.month;
  const toDateLabel = lastElapsed ? `累計（${monthNo(fyStart)}月〜${monthNo(lastElapsed)}月）` : "";
  const annual = series.reduce((a, r) => addFigures(a, r.f), ZERO);
  const chartData = series.map((r) => ({
    name: `${monthNo(r.month)}月`,
    実績: r.phase === "future" ? null : r.f.sales,
    目標: r.f.targetSales > 0 ? r.f.targetSales : null,
  }));

  return (
    <>
      {/* 選択月の達成状況（店舗別） */}
      <Card className="p-4 space-y-3">
        <SectionTitle>目標達成状況（{monthLabelJa(month)}）</SectionTitle>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {sync ?? <span />}
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="売上の基準">
            <span className="text-xs text-muted">売上の基準</span>
            {(["cash", "accounting"] as const).map((b) => (
              <Chip
                key={b}
                label={BASIS_LABEL[b]}
                selected={basis === b}
                onClick={() => onBasisChange(b)}
              />
            ))}
          </div>
        </div>
        <ul className={`grid grid-cols-1 gap-3 ${monthRows.length > 1 ? "lg:grid-cols-3" : ""}`}>
          {monthRows.map((r) => (
            <li key={r.key} className="rounded-xl border border-hairline p-3 space-y-3">
              <p className="font-semibold text-ink">{r.label}</p>
              <ProgressRow
                label={`売上（${BASIS_LABEL[basis]}）`}
                actual={r.f.sales}
                target={r.f.targetSales}
                format={yen}
                phase={phase}
                pace={pace}
                perDay
              />
              <ProgressRow
                label="新規"
                actual={r.f.newCustomers}
                target={r.f.targetNew}
                format={count}
                phase={phase}
                pace={pace}
              />
            </li>
          ))}
        </ul>
        <div className="text-[11px] text-muted space-y-0.5">
          {pace && <p>バーの縦線は、今日までの経過日数から見た目安です</p>}
          {salonOneStores.length > 0 && (
            <p>
              {mixed && `${names(salonOneStores)}の`}実績はサロンワン（入金ベース＝粗売上 ／
              会計上＝消化売上、新規＝新規来店数。いずれもサロンワンで会計した分）
            </p>
          )}
          {nobleStores.length > 0 && (
            <p>
              {mixed && `${names(nobleStores)}の`}実績は 売上＝実績入力の合計（入金ベース＝都度払い＋
              回数券販売＋物販 ／ 会計上＝都度払い＋回数券消化＋物販）、新規＝初回来店日がその月の
              顧客数（カルテ連動）
            </p>
          )}
          {switchMonths.length > 0 && (
            <p>
              サロンワン切替月:{" "}
              {switchMonths
                .map((s) => `${s.name} ${monthLabelJa(s.salonone_from!)}〜`)
                .join("・")}
              （それより前の月は Noble の実績。
              <Link href="/admin/targets" className="text-gold-dk underline underline-offset-2">
                目標設定
              </Link>
              で変更できます）
            </p>
          )}
          {unsetStores.length > 0 && (
            <p>
              目標未設定: {unsetStores.map((s) => s.name).join("・")}（
              <Link href="/admin/targets" className="text-gold-dk underline underline-offset-2">
                目標設定
              </Link>
              から入力できます）
            </p>
          )}
        </div>
      </Card>

      {/* 年度の推移 */}
      <Card className="p-4 space-y-4">
        <SectionTitle>年度の推移（{fiscalYearLabel(fyStart)}）</SectionTitle>
        {targetStores.length >= 2 && <p className="text-xs text-muted -mt-2">{totalLabel}</p>}

        {elapsed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SummaryBox
              title={toDateLabel}
              note="同じ期間の目標に対する達成率"
              sales={[toDate.sales, toDate.targetSales]}
              newCustomers={[toDate.newCustomers, toDate.targetNew]}
            />
            <SummaryBox
              title="年間目標に対する進捗"
              note={`年間目標 ${yen(annual.targetSales)} ・ ${count(annual.targetNew)}`}
              sales={[toDate.sales, annual.targetSales]}
              newCustomers={[toDate.newCustomers, annual.targetNew]}
            />
          </div>
        )}

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#8E8276" fontSize={12} tickLine={false} />
              <YAxis
                stroke="#8E8276"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
                width={44}
              />
              <Tooltip
                formatter={(v) => (v == null ? "—" : yen(Number(v)))}
                contentStyle={{ borderRadius: 12, border: "1px solid #E8E0D4", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="実績" fill="#B89B5E" radius={[6, 6, 0, 0]} />
              <Line
                type="monotone"
                dataKey="目標"
                stroke="#3D352E"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-hairline">
                <th className="text-left py-2 font-semibold">月</th>
                <th className="text-right font-semibold">売上目標</th>
                <th className="text-right font-semibold">売上実績</th>
                <th className="text-right font-semibold">達成率</th>
                <th className="text-right font-semibold">新規目標</th>
                <th className="text-right font-semibold">新規実績</th>
                <th className="text-right font-semibold">達成率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {series.map((r) => {
                const future = r.phase === "future";
                return (
                  <tr key={r.month} className={r.month === month ? "bg-gold-soft/40" : undefined}>
                    <td className="py-1.5 text-ink tnum">{monthLabelJa(r.month)}</td>
                    <td className="text-right text-muted tnum">
                      {r.f.targetSales > 0 ? yen(r.f.targetSales) : "—"}
                    </td>
                    <td className="text-right text-ink tnum">{future ? "—" : yen(r.f.sales)}</td>
                    <td className="text-right tnum font-semibold">
                      {future ? "" : rateText(r.f.sales, r.f.targetSales)}
                    </td>
                    <td className="text-right text-muted tnum">
                      {r.f.targetNew > 0 ? count(r.f.targetNew) : "—"}
                    </td>
                    <td className="text-right text-ink tnum">
                      {future ? "—" : count(r.f.newCustomers)}
                    </td>
                    <td className="text-right tnum font-semibold">
                      {future ? "" : rateText(r.f.newCustomers, r.f.targetNew)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline text-ink font-semibold">
                <td className="py-2">年間</td>
                <td className="text-right tnum">{yen(annual.targetSales)}</td>
                <td className="text-right tnum">{yen(annual.sales)}</td>
                <td className="text-right tnum">{rateText(annual.sales, annual.targetSales)}</td>
                <td className="text-right tnum">{count(annual.targetNew)}</td>
                <td className="text-right tnum">{count(annual.newCustomers)}</td>
                <td className="text-right tnum">
                  {rateText(annual.newCustomers, annual.targetNew)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

/* 目標に対する実績のバー（当月は経過日数の目安線つき） */
function ProgressRow({
  label,
  actual,
  target,
  format,
  phase,
  pace,
  perDay = false,
}: {
  label: string;
  actual: number;
  target: number;
  format: (n: number) => string;
  phase: MonthPhase;
  pace: { pace: number; remainingDays: number } | null;
  perDay?: boolean;
}) {
  if (target <= 0) {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="text-sm text-ink tnum">
          {format(actual)}
          <span className="text-muted text-xs"> / 目標未設定</span>
        </span>
      </div>
    );
  }

  const rate = (actual / target) * 100;
  const rest = target - actual;
  let hint = "";
  if (rest <= 0) hint = rest < 0 ? `目標を ${format(-rest)} 上回っています` : "目標達成";
  else if (phase === "current" && pace)
    hint =
      `あと ${format(rest)} ・ 残り${pace.remainingDays}日` +
      (perDay ? `（1日あたり ${format(Math.ceil(rest / pace.remainingDays))}）` : "");
  else if (phase === "past") hint = `目標まで ${format(rest)} 届きませんでした`;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="text-sm text-ink tnum">
          {format(actual)}
          <span className="text-muted"> / {format(target)}</span>
          <span className={`ml-2 font-semibold ${rateTone(rate, phase, pace?.pace ?? null)}`}>
            {rate.toFixed(0)}%
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-base border border-hairline overflow-hidden">
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
        {pace && (
          <span
            className="absolute inset-y-0 w-0.5 bg-ink/40"
            style={{ left: `${pace.pace}%` }}
            aria-hidden
          />
        )}
      </div>
      {hint && <p className="text-[11px] text-muted tnum">{hint}</p>}
    </div>
  );
}

/* 累計・年間進捗のサマリー */
function SummaryBox({
  title,
  note,
  sales,
  newCustomers,
}: {
  title: string;
  note: string;
  sales: [number, number]; // [実績, 目標]
  newCustomers: [number, number];
}) {
  return (
    <div className="rounded-xl bg-base border border-hairline p-3 space-y-1.5">
      <p className="text-xs font-semibold text-muted">{title}</p>
      <p className="text-sm text-ink tnum">
        売上 {yen(sales[0])}
        <span className="text-muted"> / {yen(sales[1])}</span>
        <span className="ml-2 font-semibold">{rateText(sales[0], sales[1])}</span>
      </p>
      <p className="text-sm text-ink tnum">
        新規 {count(newCustomers[0])}
        <span className="text-muted"> / {count(newCustomers[1])}</span>
        <span className="ml-2 font-semibold">{rateText(newCustomers[0], newCustomers[1])}</span>
      </p>
      <p className="text-[11px] text-muted">{note}</p>
    </div>
  );
}
