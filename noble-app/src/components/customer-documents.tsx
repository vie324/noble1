"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Chip, SectionTitle } from "@/components/ui";
import { dateTimeLabel } from "@/lib/format";
import type { ConsentDocument, ConsentTemplate, CounselingSheet } from "@/lib/types";

// 顧客ページ内: カウンセリングシート・同意書の発行と確認
export function CustomerDocuments({
  customerId,
  lineChatUrl,
}: {
  customerId: number;
  lineChatUrl: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sheets, setSheets] = useState<CounselingSheet[]>([]);
  const [docs, setDocs] = useState<ConsentDocument[]>([]);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [openSheetId, setOpenSheetId] = useState<number | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, d, t] = await Promise.all([
      supabase
        .from("counseling_sheets")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("consent_documents")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase.from("consent_templates").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setSheets((s.data as CounselingSheet[]) ?? []);
    setDocs((d.data as ConsentDocument[]) ?? []);
    setTemplates((t.data as ConsentTemplate[]) ?? []);
  }, [supabase, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const formUrl = (kind: "c" | "s", token: string) =>
    `${window.location.origin}/f/${kind}/${token}`;

  async function copyLink(kind: "c" | "s", token: string) {
    try {
      await navigator.clipboard.writeText(formUrl(kind, token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("このURLをコピーしてください", formUrl(kind, token));
    }
  }

  async function issueSheet() {
    setBusy(true);
    await supabase.from("counseling_sheets").insert({ customer_id: customerId });
    await load();
    setBusy(false);
  }

  async function issueConsent() {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setBusy(true);
    await supabase.from("consent_documents").insert({
      customer_id: customerId,
      template_id: tpl.id,
      title: tpl.title,
      body_snapshot: tpl.body,
    });
    setIssuing(false);
    setTemplateId(null);
    await load();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-4">
      <SectionTitle>カウンセリング・同意書</SectionTitle>

      {/* カウンセリングシート */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted">カウンセリングシート</p>
          <Button variant="ghost" disabled={busy} onClick={issueSheet}>
            ＋ 発行
          </Button>
        </div>
        {sheets.length === 0 ? (
          <p className="text-sm text-muted">まだ発行されていません</p>
        ) : (
          <ul className="space-y-2">
            {sheets.map((s) => (
              <li key={s.id} className="rounded-xl border border-hairline p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {s.status === "submitted" ? (
                    <Badge color="ok">回答済み</Badge>
                  ) : (
                    <Badge color="warn">未回答</Badge>
                  )}
                  <span className="text-xs text-muted tnum">
                    {s.status === "submitted" && s.submitted_at
                      ? `回答 ${dateTimeLabel(s.submitted_at)}`
                      : `発行 ${dateTimeLabel(s.created_at)}`}
                  </span>
                  <span className="flex-1" />
                  {s.status === "pending" ? (
                    <>
                      <Button variant="ghost" onClick={() => copyLink("c", s.token)}>
                        {copied === s.token ? "✓ コピー済み" : "リンクをコピー"}
                      </Button>
                      {lineChatUrl && (
                        <a href={lineChatUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost">LINEで送る</Button>
                        </a>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => setOpenSheetId(openSheetId === s.id ? null : s.id)}
                    >
                      {openSheetId === s.id ? "閉じる" : "回答を見る"}
                    </Button>
                  )}
                </div>
                {openSheetId === s.id && s.answers && (
                  <dl className="mt-2 rounded-lg bg-base border border-hairline p-3 space-y-2 fade-in">
                    {Object.entries(s.answers).map(([q, a]) => (
                      <div key={q}>
                        <dt className="text-[11px] text-muted">{q}</dt>
                        <dd className="text-sm text-ink whitespace-pre-wrap">{a || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ornament-divider text-[8px]">◆</div>

      {/* 同意書 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted">同意書</p>
          <Button variant="ghost" onClick={() => setIssuing(!issuing)}>
            {issuing ? "閉じる" : "＋ 発行"}
          </Button>
        </div>

        {issuing && (
          <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
            <div className="flex gap-2 flex-wrap">
              {templates.map((t) => (
                <Chip
                  key={t.id}
                  label={t.title}
                  selected={templateId === t.id}
                  onClick={() => setTemplateId(t.id)}
                />
              ))}
            </div>
            <Button disabled={busy || !templateId} onClick={issueConsent}>
              この同意書を発行する
            </Button>
          </div>
        )}

        {docs.length === 0 ? (
          <p className="text-sm text-muted">まだ発行されていません</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-hairline p-3 flex items-center gap-2 flex-wrap"
              >
                {d.status === "signed" ? (
                  <Badge color="ok">署名済み</Badge>
                ) : (
                  <Badge color="warn">未署名</Badge>
                )}
                <span className="text-sm text-ink">{d.title}</span>
                <span className="text-xs text-muted tnum">
                  {d.status === "signed" && d.signed_at
                    ? dateTimeLabel(d.signed_at)
                    : dateTimeLabel(d.created_at)}
                </span>
                <span className="flex-1" />
                {d.status === "pending" ? (
                  <>
                    <a href={`/f/s/${d.token}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost">iPadで開く</Button>
                    </a>
                    <Button variant="ghost" onClick={() => copyLink("s", d.token)}>
                      {copied === d.token ? "✓ コピー済み" : "リンクをコピー"}
                    </Button>
                    {lineChatUrl && (
                      <a href={lineChatUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost">LINEで送る</Button>
                      </a>
                    )}
                  </>
                ) : (
                  <Link href={`/documents/${d.id}/print`}>
                    <Button variant="ghost">表示・印刷</Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-muted">
        リンクをコピーして LINE に貼り付けると、お客様のスマホで入力・署名できます
      </p>
    </Card>
  );
}
