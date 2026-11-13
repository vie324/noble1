"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, TextField } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  // ログインはできたがスタッフ登録がない・無効になっている場合（(app)/layout.tsx から戻される）
  const reason = useSearchParams().get("reason");

  // 残っているセッションを消しておく（別のアカウントで入り直せるように）
  useEffect(() => {
    if (reason === "no-staff") createClient().auth.signOut();
  }, [reason]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setError("メールアドレスまたはパスワードが正しくありません");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-10">
          <Image
            src="/logo.png"
            alt="ESTHETIC BY NOBLE"
            width={210}
            height={198}
            priority
            className="mx-auto"
          />
          <p className="mt-4 text-sm text-muted tracking-widest">
            ノーブル業務システム
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="noble-card gold-hairline p-6 space-y-4"
        >
          <TextField
            label="メールアドレス"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="パスワード"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? (
            <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">
              {error}
            </p>
          ) : reason === "no-staff" ? (
            <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">
              このアカウントはスタッフとして登録されていないか、無効になっています。管理者に確認してください
            </p>
          ) : null}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "サインイン中…" : "サインイン"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted leading-relaxed">
          1つのアカウントで全店舗をご利用いただけます
          <br />
          パスワードを忘れたときは、管理者に再設定を依頼してください
        </p>
      </div>
    </main>
  );
}
