"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { importSalonOneFiscalYear } from "@/app/(app)/admin/salonone-actions";
import { dateTimeLabel } from "@/lib/format";

// サロンワンからの手動取り込み（毎朝の自動取り込みを待たずに最新にする）
export function SalonOneSync({
  fyStart,
  lastFetchedAt,
  onImported,
}: {
  fyStart: string; // 取り込む年度（9月〜翌8月のうち今月まで）
  lastFetchedAt: string | null;
  onImported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const res = await importSalonOneFiscalYear(fyStart);
    setResult(res);
    setBusy(false);
    if (res.ok) onImported();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="secondary" onClick={run} disabled={busy}>
        {busy ? "取り込み中…" : "サロンワンから取り込む"}
      </Button>
      <span className={`text-[11px] ${result && !result.ok ? "text-caution" : "text-muted"}`}>
        {result
          ? result.message
          : lastFetchedAt
            ? `最終取り込み ${dateTimeLabel(lastFetchedAt)}`
            : "まだ取り込んでいません"}
      </span>
    </div>
  );
}
