"use client";

import { useState } from "react";
import { Card, CountUp, SectionTitle } from "@/components/ui";
import { AdminTabs } from "@/components/admin-tabs";
import { yen } from "@/lib/format";

// 目標シミュレーション（既存ダッシュボードの機能を移植・クライアント計算のみ）
export default function SimulationPage() {
  const [target, setTarget] = useState(3000000);
  const [avgPrice, setAvgPrice] = useState(18000);
  const [visits, setVisits] = useState(150);

  const projected = avgPrice * visits;
  const gap = target - projected;
  const requiredVisits = avgPrice > 0 ? Math.ceil(target / avgPrice) : 0;
  const requiredPrice = visits > 0 ? Math.ceil(target / visits) : 0;
  const achieve = target > 0 ? (projected / target) * 100 : 0;

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div>
        <h1 className="serif text-3xl text-ink">目標シミュレーション</h1>
        <p className="text-sm text-muted mt-1">客単価 × 来客数で月間目標の達成ラインを試算します</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 入力 */}
        <Card className="p-4 space-y-4">
          <SectionTitle>条件</SectionTitle>
          <SimSlider
            label="月間目標売上"
            value={target}
            min={500000}
            max={10000000}
            step={100000}
            format={yen}
            onChange={setTarget}
          />
          <SimSlider
            label="平均客単価"
            value={avgPrice}
            min={3000}
            max={50000}
            step={500}
            format={yen}
            onChange={setAvgPrice}
          />
          <SimSlider
            label="月間来客数"
            value={visits}
            min={10}
            max={600}
            step={5}
            format={(n) => `${n}名`}
            onChange={setVisits}
          />
        </Card>

        {/* 結果 */}
        <Card className="p-4 space-y-4">
          <SectionTitle>試算結果</SectionTitle>
          <div className="text-center py-2">
            <p className="text-xs text-muted">この条件での見込み売上</p>
            <p className="serif text-4xl text-gold-dk mt-1">
              <CountUp value={projected} format={yen} />
            </p>
            <p className={`text-sm mt-2 tnum ${gap <= 0 ? "text-ok" : "text-caution"}`}>
              {gap <= 0
                ? `目標を ${yen(-gap)} 上回ります（達成率 ${achieve.toFixed(0)}%）`
                : `目標まで あと ${yen(gap)}（達成率 ${achieve.toFixed(0)}%）`}
            </p>
          </div>
          <div className="h-2 rounded-full bg-base border border-hairline overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, achieve)}%`,
                background:
                  achieve >= 100
                    ? "var(--noble-ok)"
                    : "linear-gradient(to right, var(--noble-gold), var(--noble-gold-dk))",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-xl bg-base border border-hairline p-3 text-center">
              <p className="text-[11px] text-muted">目標達成に必要な来客数</p>
              <p className="serif text-2xl text-ink mt-1 tnum">
                {requiredVisits}
                <span className="text-sm ml-0.5">名</span>
              </p>
              <p className="text-[11px] text-muted mt-0.5 tnum">
                現在の単価 {yen(avgPrice)} の場合
              </p>
            </div>
            <div className="rounded-xl bg-base border border-hairline p-3 text-center">
              <p className="text-[11px] text-muted">目標達成に必要な客単価</p>
              <p className="serif text-2xl text-ink mt-1 tnum">{yen(requiredPrice)}</p>
              <p className="text-[11px] text-muted mt-0.5 tnum">現在の来客 {visits}名 の場合</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SimSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="serif text-lg text-ink tnum">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--noble-gold) min-h-11"
        aria-label={label}
      />
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={0}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="mt-1 w-36 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
        aria-label={`${label}（直接入力）`}
      />
    </div>
  );
}
