"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { setStaffPassword } from "@/app/(app)/admin/staff-actions";
import { PASSWORD_MIN } from "@/lib/types";

// 読み間違えやすい文字（0/O・1/l/I など）を除いた文字で、伝えやすいパスワードを作る
function generatePassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

// マスタ管理 > スタッフ の「🔑 パスワード」（管理者専用。サーバー側でも管理者かを確認する）
export function StaffPasswordPanel({
  staffId,
  staffName,
  email,
  hasLogin,
  onDone,
}: {
  staffId: number;
  staffName: string;
  email: string;
  hasLogin: boolean;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string; created: boolean } | null>(null);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const [copied, setCopied] = useState(false);

  // スタッフに送る案内文（LINE などに貼り付けて送る）
  function guideText(d: { email: string; password: string }): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return [
      `${staffName}さん`,
      "NOBLE業務システムのログイン情報です。",
      "",
      `URL：${origin}/login`,
      `ログインID（メールアドレス）：${d.email}`,
      `パスワード：${d.password}`,
      "",
      "ログイン後、メニュー（≡）の「パスワード変更」から自分のパスワードに変更できます。",
      "スマホのホーム画面に追加しておくと、アプリのように開けます。",
    ].join("\n");
  }

  async function copyGuide() {
    if (!done) return;
    const text = guideText(done);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("この案内文をコピーしてください", text);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    const r = await setStaffPassword(staffId, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone({ email: r.email, password, created: r.created });
    setPassword("");
    onDone();
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
      <div className="text-sm space-y-1">
        <p>
          <span className="text-muted">ログインID（メールアドレス）：</span>
          <span className="font-semibold text-ink break-all">{email}</span>
        </p>
        {!done && (
        <p className="text-xs text-muted">
          {hasLogin
            ? "ログインは発行済みです。新しいパスワードを設定すると、今のパスワードは使えなくなります。"
            : "まだログインがありません。パスワードを設定すると、このメールアドレスでログインできるようになります。"}
        </p>
        )}
      </div>

      {done ? (
        <div className="rounded-lg border border-ok/40 bg-ok-soft px-3 py-2.5 text-sm space-y-1">
          <p className="font-semibold text-ok">
            {done.created ? "ログインを作成しました" : "パスワードを変更しました"}
          </p>
          <p className="text-ink">
            ログインID：<span className="font-semibold break-all">{done.email}</span>
          </p>
          <p className="text-ink">
            パスワード：<span className="font-semibold tnum tracking-wide">{done.password}</span>
          </p>
          <p className="text-xs text-muted">
            {staffName}さんに直接お伝えください。この表示を閉じると、パスワードは二度と表示されません。
          </p>
          <div className="pt-1">
            <Button variant="secondary" onClick={copyGuide}>
              {copied ? "✓ コピーしました" : "案内文をコピー（LINEなどで送る用）"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="block text-xs font-semibold text-muted mb-1">
              新しいパスワード（{PASSWORD_MIN}文字以上）
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                autoComplete="new-password"
                spellCheck={false}
                autoCapitalize="off"
                value={password}
                onChange={(e) => setPassword(e.target.value.trim())}
                className="flex-1 min-w-0 min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base text-ink tnum outline-none focus:border-gold"
              />
              <Button variant="secondary" onClick={() => setPassword(generatePassword())}>
                自動で作る
              </Button>
            </div>
          </label>
          {tooShort && <p className="text-xs text-caution">あと{PASSWORD_MIN - password.length}文字以上入力してください</p>}
          {error && <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>}
          <Button disabled={busy || password.length < PASSWORD_MIN} onClick={save}>
            {busy ? "設定中…" : hasLogin ? "パスワードを変更する" : "ログインを作成する"}
          </Button>
        </>
      )}
    </div>
  );
}
