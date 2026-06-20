"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, ListSkeleton, SectionTitle, TextField } from "@/components/ui";
import { AdminTabs } from "@/components/admin-tabs";
import {
  getLineConfigViews,
  saveLineConfig,
  testLineConnection,
  type LineConfigView,
} from "./actions";

// 店舗ごとの LINE Messaging API 連携設定（管理者専用）
export default function AdminLinePage() {
  const { stores } = useApp();
  const [views, setViews] = useState<LineConfigView[] | null>(null);
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  async function load() {
    setViews(await getLineConfigViews());
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div>
        <h1 className="serif text-3xl text-ink">LINE連携（店舗別）</h1>
        <p className="text-sm text-muted mt-1">
          店舗ごとの LINE公式アカウントと Messaging API で連携します
        </p>
      </div>

      <Card className="p-4 space-y-2">
        <SectionTitle>設定手順</SectionTitle>
        <ol className="text-sm text-ink list-decimal pl-5 space-y-1">
          <li>
            <a
              href="https://developers.line.biz/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-dk underline underline-offset-2"
            >
              LINE Developers
            </a>{" "}
            で各店舗の公式アカウントに Messaging API チャネルを作成
          </li>
          <li>「チャネルアクセストークン（長期）」と「チャネルシークレット」を取得</li>
          <li>下の各店舗欄に貼り付けて保存 →「接続テスト」で確認</li>
          <li>
            各店舗の <strong>Webhook URL</strong>（下に表示）を LINE Developers に登録し、
            Webhook を「オン」にする
          </li>
        </ol>
      </Card>

      {views === null ? (
        <ListSkeleton rows={3} />
      ) : (
        stores.map((s) => (
          <StoreLineCard
            key={s.id}
            storeId={s.id}
            storeName={s.name}
            webhookUrl={`${origin}/api/line/${s.id}`}
            view={views.find((v) => v.store_id === s.id) ?? null}
            onSaved={load}
          />
        ))
      )}
    </div>
  );
}

function StoreLineCard({
  storeId,
  storeName,
  webhookUrl,
  view,
  onSaved,
}: {
  storeId: number;
  storeName: string;
  webhookUrl: string;
  view: LineConfigView | null;
  onSaved: () => Promise<void>;
}) {
  const [accessToken, setAccessToken] = useState("");
  const [secret, setSecret] = useState("");
  const [botBasicId, setBotBasicId] = useState(view?.bot_basic_id ?? "");
  const [isActive, setIsActive] = useState(view?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await saveLineConfig(storeId, { accessToken, secret, botBasicId, isActive });
    setMessage(res.ok ? "保存しました" : res.message ?? "保存に失敗しました");
    if (res.ok) {
      setAccessToken("");
      setSecret("");
      await onSaved();
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    const res = await testLineConnection(storeId);
    setMessage(res.message);
    setBusy(false);
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("このURLをコピーしてください", webhookUrl);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">{storeName}</SectionTitle>
        {view?.configured ? (
          view.is_active ? (
            <Badge color="ok">連携済み</Badge>
          ) : (
            <Badge color="warn">停止中</Badge>
          )
        ) : (
          <Badge color="rose">未設定</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label={`チャネルアクセストークン${view?.configured ? "（変更時のみ入力）" : ""}`}
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={view?.configured ? "設定済み" : ""}
        />
        <TextField
          label={`チャネルシークレット${view?.configured ? "（変更時のみ入力）" : ""}`}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={view?.configured ? "設定済み" : ""}
        />
        <TextField
          label="公式アカウントID（@xxxx・任意）"
          value={botBasicId}
          onChange={(e) => setBotBasicId(e.target.value)}
        />
        <label className="flex items-center gap-2 self-end min-h-11">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-5 h-5 accent-(--noble-gold)"
          />
          <span className="text-sm text-ink">連携を有効にする</span>
        </label>
      </div>

      <div>
        <span className="block text-xs font-semibold text-muted mb-1">Webhook URL（LINE側に登録）</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-base border border-hairline rounded-lg px-2 py-2 break-all tnum">
            {webhookUrl}
          </code>
          <Button variant="ghost" onClick={copyWebhook}>
            {copied ? "✓" : "コピー"}
          </Button>
        </div>
      </div>

      {message && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.includes("失敗") || message.includes("権限")
              ? "text-caution bg-caution-soft"
              : "text-ok bg-ok-soft"
          }`}
        >
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>
          {busy ? "処理中…" : "保存"}
        </Button>
        <Button variant="secondary" disabled={busy || !view?.configured} onClick={test}>
          接続テスト
        </Button>
      </div>
    </Card>
  );
}
