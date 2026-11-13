"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/components/toast";
import { Button, Card, TextField } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/types";

// 自分のパスワード変更（スタッフ・管理者。店舗アカウントは /my/layout.tsx で入れない）
export default function MyPasswordPage() {
  const { me } = useApp();
  const notify = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSave = password.length >= PASSWORD_MIN && password === confirm && !/\s/.test(password);

  async function save() {
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(
        /different from the old/i.test(err.message)
          ? "今と同じパスワードです。別のパスワードを入力してください"
          : /weak|short|characters/i.test(err.message)
            ? `パスワードが短すぎるか、簡単すぎます（${PASSWORD_MIN}文字以上で、英字と数字を混ぜてください）`
            : /reauth|recent/i.test(err.message)
              ? "安全のため、一度ログアウトしてログインし直してから変更してください"
              : `変更できませんでした（${err.message}）`
      );
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
    notify("パスワードを変更しました");
  }

  return (
    <div className="space-y-5 fade-in max-w-lg">
      <div>
        <h1 className="serif text-3xl text-ink">パスワード変更</h1>
        <p className="text-sm text-muted mt-1">ログインID（メールアドレス）：{me.email}</p>
      </div>
      <Card className="p-4 space-y-4">
        {done && (
          <p className="rounded-lg border border-ok/40 bg-ok-soft px-3 py-2 text-sm text-ok">
            ✓ パスワードを変更しました。次回から新しいパスワードでログインしてください
          </p>
        )}
        <TextField
          label={`新しいパスワード（${PASSWORD_MIN}文字以上）`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="もう一度入力"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {password.length > 0 && password.length < PASSWORD_MIN && (
          <p className="text-xs text-caution">あと{PASSWORD_MIN - password.length}文字以上入力してください</p>
        )}
        {mismatch && <p className="text-xs text-caution">上と同じパスワードを入力してください</p>}
        {error && <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>}
        <Button disabled={busy || !canSave} onClick={save}>
          {busy ? "変更中…" : "変更する"}
        </Button>
        <p className="text-xs text-muted">
          パスワードを忘れたときは、管理者（マスタ管理 &gt; スタッフの「🔑 パスワード」）に再設定を依頼してください。
        </p>
      </Card>
    </div>
  );
}
