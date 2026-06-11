import { createAdminClient } from "@/lib/supabase/admin";
import { ConsentSign } from "./consent-sign";

export const dynamic = "force-dynamic";

// 同意書（iPad またはお客様のスマホで確認・電子署名）
export default async function ConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let doc: {
    id: number;
    status: string;
    title: string;
    body_snapshot: string;
    customerName: string;
    signed_at: string | null;
  } | null = null;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("consent_documents")
      .select("id, status, title, body_snapshot, signed_at, customers (name)")
      .eq("token", token)
      .maybeSingle();
    if (data) {
      const customers = data.customers as unknown as { name: string } | null;
      doc = {
        id: data.id,
        status: data.status,
        title: data.title,
        body_snapshot: data.body_snapshot,
        signed_at: data.signed_at,
        customerName: customers?.name ?? "",
      };
    }
  } catch (e) {
    console.error(e);
  }

  if (!doc) {
    return (
      <div className="noble-card gold-hairline p-6 text-center">
        <p className="text-sm text-muted">
          同意書が見つかりませんでした。
          <br />
          お手数ですが、サロンまでお問い合わせください。
        </p>
      </div>
    );
  }

  if (doc.status === "signed") {
    return (
      <div className="noble-card gold-hairline p-6 text-center space-y-2">
        <p className="text-gold text-xs" aria-hidden>◆</p>
        <p className="serif text-xl text-ink">署名済みです</p>
        <p className="text-sm text-muted">この同意書はすでにご署名いただいています。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="serif text-2xl text-ink">{doc.title}</h1>
        <p className="text-sm text-muted mt-1">{doc.customerName} 様</p>
      </div>
      <div className="noble-card gold-hairline p-5">
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {doc.body_snapshot}
        </p>
      </div>
      <ConsentSign token={token} defaultName={doc.customerName} />
    </div>
  );
}
