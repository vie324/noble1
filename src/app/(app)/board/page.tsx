"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ListSkeleton,
  TextArea,
  TextField,
} from "@/components/ui";
import { dateSlash } from "@/lib/format";
import { BOARD_CATEGORIES } from "@/lib/types";
import type { BoardPost } from "@/lib/types";

// スタッフ掲示板・資料置き場（閲覧=全員 / 投稿・編集=管理者）
export default function BoardPage() {
  const { isAdmin } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<BoardPost | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPosts(null);
    let q = supabase
      .from("board_posts")
      .select("*, board_attachments (*)")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (category) q = q.eq("category", category);
    const { data } = await q;
    setPosts((data as unknown as BoardPost[]) ?? []);
  }, [supabase, category]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePin(post: BoardPost) {
    setBusy(true);
    await supabase.from("board_posts").update({ pinned: !post.pinned }).eq("id", post.id);
    await load();
    setBusy(false);
  }

  async function deletePost(post: BoardPost) {
    if (!window.confirm(`「${post.title}」を削除しますか？`)) return;
    setBusy(true);
    const paths = (post.board_attachments ?? []).map((a) => a.file_path);
    if (paths.length > 0) await supabase.storage.from("board-files").remove(paths);
    await supabase.from("board_posts").delete().eq("id", post.id);
    await load();
    setBusy(false);
  }

  async function downloadAttachment(path: string, name: string) {
    const { data } = await supabase.storage.from("board-files").createSignedUrl(path, 300, {
      download: name,
    });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">掲示板・資料置き場</h1>
          <p className="text-sm text-muted mt-1">共有事項・マニュアル・研修資料</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setEditing(editing === "new" ? null : "new")}>
            ＋ 投稿する
          </Button>
        )}
      </div>

      {/* カテゴリフィルタ */}
      <div className="flex gap-2 flex-wrap">
        <Chip label="すべて" selected={category === null} onClick={() => setCategory(null)} />
        {BOARD_CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onClick={() => setCategory(c)} />
        ))}
      </div>

      {editing === "new" && (
        <PostForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {posts === null ? (
        <ListSkeleton rows={5} />
      ) : posts.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="このカテゴリの投稿はまだありません" />
        </Card>
      ) : (
        <ul className="space-y-3 stagger">
          {posts.map((p) =>
            editing !== "new" && editing?.id === p.id ? (
              <li key={p.id}>
                <PostForm
                  initial={p}
                  onCancel={() => setEditing(null)}
                  onSaved={async () => {
                    setEditing(null);
                    await load();
                  }}
                />
              </li>
            ) : (
              <li key={p.id}>
                <Card className={`overflow-hidden ${p.pinned ? "border-gold/60" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === p.id ? null : p.id)}
                    aria-expanded={openId === p.id}
                    className="w-full text-left p-4 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.pinned && <Badge color="gold">📌 ピン留め</Badge>}
                        <Badge color="rose">{p.category}</Badge>
                        <span className="text-xs text-muted tnum">
                          {dateSlash(p.updated_at)}
                        </span>
                      </div>
                      <p className="font-semibold text-ink mt-1.5">{p.title}</p>
                      {openId !== p.id && (
                        <p className="text-sm text-muted truncate mt-0.5">{p.body}</p>
                      )}
                    </div>
                    <span className="text-muted text-sm shrink-0" aria-hidden>
                      {openId === p.id ? "▲" : "▼"}
                    </span>
                  </button>

                  {openId === p.id && (
                    <div className="px-4 pb-4 fade-in space-y-3">
                      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                        {p.body}
                      </p>
                      {(p.board_attachments ?? []).length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {p.board_attachments!.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => downloadAttachment(a.file_path, a.file_name)}
                              className="inline-flex items-center gap-1.5 min-h-10 rounded-full border border-gold/50 bg-gold-soft px-4 text-sm text-gold-dk hover:bg-gold-soft/70 transition-colors"
                            >
                              📎 {a.file_name}
                            </button>
                          ))}
                        </div>
                      )}
                      {isAdmin && (
                        <div className="flex gap-2 pt-1">
                          <Button variant="ghost" disabled={busy} onClick={() => setEditing(p)}>
                            編集
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => togglePin(p)}>
                            {p.pinned ? "ピン解除" : "ピン留め"}
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => deletePost(p)}>
                            削除
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

/* ================= 投稿フォーム（管理者） ================= */
function PostForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: BoardPost | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [cat, setCat] = useState<string>(initial?.category ?? BOARD_CATEGORIES[0]);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let postId = initial?.id;
      const payload = { title: title.trim(), body, category: cat, pinned };
      if (initial) {
        const { error: e } = await supabase
          .from("board_posts")
          .update(payload)
          .eq("id", initial.id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase
          .from("board_posts")
          .insert(payload)
          .select("id")
          .single();
        if (e) throw e;
        postId = data.id;
      }

      // 添付ファイル（管理者のみアップロード可）
      for (const f of files) {
        const path = `${postId}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("board-files")
          .upload(path, f);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase
          .from("board_attachments")
          .insert({ post_id: postId, file_path: path, file_name: f.name });
        if (insErr) throw insErr;
      }
      await onSaved();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました");
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3 border-gold/50">
      <TextField label="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2 flex-wrap">
        {BOARD_CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={cat === c} onClick={() => setCat(c)} />
        ))}
      </div>
      <TextArea label="本文" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-3 flex-wrap">
        <Chip label="📌 ピン留め" selected={pinned} onClick={() => setPinned(!pinned)} />
        <label className="inline-flex items-center min-h-11 px-4 rounded-full border border-dashed border-gold/60 text-sm text-gold-dk cursor-pointer hover:bg-gold-soft transition-colors">
          📎 ファイルを添付
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {files.map((f, i) => (
          <span key={i} className="text-xs text-muted">
            {f.name}
          </span>
        ))}
      </div>
      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>
          {busy ? "保存中…" : initial ? "更新する" : "投稿する"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </Card>
  );
}
