import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GalleryPhoto } from "@/lib/types";

export const dynamic = "force-dynamic";

// お客様にお見せするビフォーアフター公開ページ（認証不要・トークンURL）
export default async function GalleryPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let title = "Before / After";
  let message: string | null = null;
  const pairs: { before: string | null; after: string | null; caption: string | null }[] = [];
  let found = false;

  try {
    const supabase = createAdminClient();
    const { data: page } = await supabase
      .from("gallery_pages")
      .select("id, title, message, is_active")
      .eq("token", token)
      .maybeSingle();

    if (page && page.is_active) {
      found = true;
      title = page.title;
      message = page.message;
      const { data: photos } = await supabase
        .from("gallery_photos")
        .select("*")
        .eq("gallery_id", page.id)
        .order("sort_order");
      const rows = (photos as GalleryPhoto[]) ?? [];

      const paths = rows.map((p) => p.storage_path);
      const urlMap = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("visit-photos")
          .createSignedUrls(paths, 60 * 60 * 24 * 7); // 7日間有効
        signed?.forEach((s) => {
          if (s.signedUrl && s.path) urlMap.set(s.path, s.signedUrl);
        });
      }

      // before/after を順番にペアリング
      const befores = rows.filter((r) => r.kind === "before");
      const afters = rows.filter((r) => r.kind === "after");
      const n = Math.max(befores.length, afters.length);
      for (let i = 0; i < n; i++) {
        pairs.push({
          before: befores[i] ? urlMap.get(befores[i].storage_path) ?? null : null,
          after: afters[i] ? urlMap.get(afters[i].storage_path) ?? null : null,
          caption: befores[i]?.caption ?? afters[i]?.caption ?? null,
        });
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (!found) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center text-muted text-sm">
          ページが見つかりませんでした。
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10">
      <div className="max-w-xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="ESTHETIC BY NOBLE"
            width={130}
            height={123}
            priority
            className="mx-auto"
          />
          <h1 className="serif text-3xl text-ink mt-4 tracking-wide">{title}</h1>
          <p className="text-gold text-[10px] tracking-[0.5em] mt-2" aria-hidden>
            ◆ ◆ ◆
          </p>
        </div>

        {message && (
          <div className="noble-card gold-hairline p-5 mb-8 text-center">
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{message}</p>
          </div>
        )}

        {/* Before / After ペア */}
        <div className="space-y-8">
          {pairs.map((p, i) => (
            <div key={i} className="fade-in">
              <div className="grid grid-cols-2 gap-3">
                <Figure label="Before" url={p.before} />
                <Figure label="After" url={p.after} />
              </div>
              {p.caption && (
                <p className="text-center text-xs text-muted mt-2">{p.caption}</p>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted mt-12">
          ESTHETIC BY NOBLE
          <br />
          ※ 効果には個人差があります
        </p>
      </div>
    </main>
  );
}

function Figure({ label, url }: { label: string; url: string | null }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="serif text-xs text-center tracking-widest uppercase text-gold-dk">
        {label}
      </figcaption>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 署名付きURL
        <img
          src={url}
          alt={label}
          className="w-full rounded-2xl border border-hairline object-cover shadow-[var(--shadow-card)]"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-2xl border border-dashed border-hairline bg-base" />
      )}
    </figure>
  );
}
