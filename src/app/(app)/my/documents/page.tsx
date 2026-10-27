"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { useInbox } from "@/lib/inbox";
import { Badge, Card, Chip, EmptyState, ListSkeleton } from "@/components/ui";
import { dateSlash, fileSize, monthLabelJa } from "@/lib/format";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-docs";
import type { StaffDocument } from "@/lib/types";

interface DocWithUrl extends StaffDocument {
  viewUrl: string | null;
  downloadUrl: string | null;
}

const URL_TTL = 60 * 60; // 署名URLの有効期間（1時間。画面に戻ったら作り直す）

// マイ書類: 管理者から配布された給与明細・源泉徴収票など（本人と管理者だけが閲覧可）
export default function MyDocumentsPage() {
  const { me } = useApp();
  const inbox = useInbox();
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<DocWithUrl[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("staff_documents")
      .select("*")
      .eq("staff_id", me.id)
      .order("created_at", { ascending: false });
    const rows = (data as StaffDocument[]) ?? [];
    const urls = new Map<string, string>();
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from(STAFF_DOCS_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), URL_TTL);
      signed?.forEach((s) => s.signedUrl && s.path && urls.set(s.path, s.signedUrl));
    }
    setDocs(
      rows.map((r) => {
        const url = urls.get(r.storage_path) ?? null;
        return {
          ...r,
          viewUrl: url,
          downloadUrl: url ? `${url}&download=${encodeURIComponent(r.file_name)}` : null,
        };
      })
    );
    setLoadedAt(Date.now());
  }, [supabase, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 長時間開いたままでもリンクが切れないよう、画面に戻ったときに作り直す
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt > (URL_TTL - 600) * 1000) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, loadedAt]);

  async function markViewed(d: DocWithUrl) {
    if (d.viewed_at) return;
    setDocs((list) => list?.map((x) => (x.id === d.id ? { ...x, viewed_at: new Date().toISOString() } : x)) ?? null);
    await supabase.rpc("mark_staff_document_viewed", { p_id: d.id });
    inbox.refresh();
  }

  const categories = [...new Set((docs ?? []).map((d) => d.category))];
  const shown = (docs ?? []).filter((d) => category === null || d.category === category);
  // 年ごとにまとめる
  const groups = shown.reduce<Map<string, DocWithUrl[]>>((map, d) => {
    const year = (d.month ?? d.created_at).slice(0, 4);
    map.set(year, [...(map.get(year) ?? []), d]);
    return map;
  }, new Map());

  return (
    <div className="max-w-2xl mx-auto space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">マイ書類</h1>
        <p className="text-sm text-muted mt-1">
          給与明細や税理士からの書類が届きます。本人と管理者だけが見られます
        </p>
      </div>

      {inbox.unreadDocuments > 0 && (
        <p className="rounded-xl bg-gold-soft border border-gold/40 px-4 py-3 text-sm text-gold-dk font-semibold">
          ✉ 新しい書類が {inbox.unreadDocuments} 件届いています
        </p>
      )}

      {categories.length > 1 && (
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5 min-w-max">
            <Chip label="すべて" selected={category === null} onClick={() => setCategory(null)} />
            {categories.map((c) => (
              <Chip key={c} label={c} selected={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>
        </div>
      )}

      {docs === null ? (
        <ListSkeleton rows={3} />
      ) : docs.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="まだ書類はありません。給与明細などが届くと、ここに表示されます" />
        </Card>
      ) : (
        [...groups.entries()].map(([year, list]) => (
          <section key={year} className="space-y-2">
            <h2 className="text-xs font-semibold text-muted tnum">{year}年</h2>
            <ul className="space-y-2.5">
              {list.map((d) => (
                <li key={d.id}>
                  <Card className={`p-4 ${d.viewed_at ? "" : "border-gold/60"}`}>
                    <div className="flex items-start gap-3">
                      <span
                        className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gold-soft text-gold-dk text-xs font-bold shrink-0"
                        aria-hidden
                      >
                        {d.mime_type === "application/pdf" ? "PDF" : d.mime_type?.startsWith("image/") ? "画像" : "表"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink break-words">
                          {d.title}
                          {!d.viewed_at && (
                            <span className="ml-2 align-middle">
                              <Badge color="caution">NEW</Badge>
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted mt-0.5 tnum">
                          {d.category}
                          {d.month && ` ・ ${monthLabelJa(d.month)}分`} ・ {dateSlash(d.created_at)}
                          {d.size_bytes ? ` ・ ${fileSize(d.size_bytes)}` : ""}
                        </p>
                        {d.note && <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{d.note}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <a
                        href={d.viewUrl ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markViewed(d)}
                        className="flex-1 inline-flex items-center justify-center min-h-11 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors"
                      >
                        開く
                      </a>
                      <a
                        href={d.downloadUrl ?? undefined}
                        onClick={() => markViewed(d)}
                        className="flex-1 inline-flex items-center justify-center min-h-11 rounded-full border border-gold text-gold-dk text-sm font-semibold hover:bg-gold-soft transition-colors"
                      >
                        保存
                      </a>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
