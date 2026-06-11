"use client";

import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ListSkeleton } from "@/components/ui";
import { dateTimeLabel } from "@/lib/format";
import type { ConsentDocument } from "@/lib/types";

interface DocWithCustomer extends ConsentDocument {
  customers: { name: string } | null;
}

// 署名済み同意書の表示・印刷（ブラウザの印刷機能でPDF保存・印刷可）
export default function ConsentPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [doc, setDoc] = useState<DocWithCustomer | null | undefined>(undefined);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("consent_documents")
        .select("*, customers (name)")
        .eq("id", Number(id))
        .maybeSingle();
      const row = (data as unknown as DocWithCustomer) ?? null;
      setDoc(row);
      if (row?.signature_path) {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(row.signature_path, 60 * 60);
        setSignatureUrl(signed?.signedUrl ?? null);
      }
    })();
  }, [supabase, id]);

  if (doc === undefined) return <ListSkeleton rows={4} />;
  if (!doc) return <p className="text-muted py-12 text-center">同意書が見つかりません</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 fade-in">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">印刷するとそのまま書面として保存できます</p>
        <Button onClick={() => window.print()}>印刷 / PDF保存</Button>
      </div>

      <div className="noble-card p-8 print:border-0 print:shadow-none">
        <div className="text-center mb-6">
          <p className="text-gold text-[10px] tracking-[0.5em]" aria-hidden>
            ◆ ◆ ◆
          </p>
          <h1 className="serif text-2xl text-ink mt-2">{doc.title}</h1>
        </div>

        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {doc.body_snapshot}
        </p>

        <div className="mt-8 pt-4 border-t border-hairline grid grid-cols-2 gap-4 items-end">
          <div className="text-sm">
            <p className="text-xs text-muted">署名日時</p>
            <p className="text-ink tnum mt-1">
              {doc.signed_at ? dateTimeLabel(doc.signed_at) : "—"}
            </p>
            <p className="text-xs text-muted mt-3">お名前</p>
            <p className="text-ink mt-1">
              {doc.signer_name ?? doc.customers?.name ?? "—"} 様
            </p>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">ご署名</p>
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 署名付きURL
              <img
                src={signatureUrl}
                alt="署名"
                className="w-full max-w-60 border-b border-ink/40"
              />
            ) : (
              <p className="text-sm text-muted">（署名画像なし）</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
