"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button, TextField } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

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
          {error && (
            <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "サインイン中…" : "サインイン"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          1つのアカウントで全店舗をご利用いただけます
        </p>
      </div>
    </main>
  );
}
