import { createAdminClient } from "@/lib/supabase/admin";
import { ConsentSign } from "./consent-sign";
import { FormComplete } from "@/components/public-form-ui";

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
        <p className="text-sm leading-relaxed text-muted">
          同意書が見つかりませんでした。
          <br />
          お手数ですが、サロンまでお問い合わせください。
        </p>
      </div>
    );
  }

  if (doc.status === "signed") {
    return (
      <FormComplete title="署名済みです">
        <span className="inline-block">この同意書は</span>
        <span className="inline-block">すでにご署名いただいています。</span>
      </FormComplete>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="serif text-2xl text-ink">{doc.title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {doc.customerName && (
            <>
              <span className="font-medium text-ink">{doc.customerName} 様</span>
              <br />
            </>
          )}
          内容をご確認のうえ、下の欄にご署名をお願いいたします
        </p>
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
