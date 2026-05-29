"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 来店前に「空のカルテ(箱)」を作成する
export async function createEmptyVisit(formData: FormData) {
  const customerId = String(formData.get("customer_id"));
  const storeId = String(formData.get("store_id"));
  const startAt = formData.get("start_at")
    ? String(formData.get("start_at"))
    : null;

  const supabase = createClient();
  const { error } = await supabase.rpc("create_empty_visit", {
    p_customer_id: customerId,
    p_store_id: storeId,
    p_start_at: startAt,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/karte");
}

// カルテ本文を保存し、状態を「記入済」にする
export async function saveVisit(formData: FormData) {
  const visitId = String(formData.get("visit_id"));
  const note = String(formData.get("note") ?? "");
  const importantNote = String(formData.get("important_note") ?? "");

  const supabase = createClient();
  const { error } = await supabase
    .from("visits")
    .update({ note, important_note: importantNote, status: "記入済" })
    .eq("id", visitId);
  if (error) throw new Error(error.message);

  revalidatePath(`/karte/${visitId}`);
  revalidatePath("/karte");
}

// 回数券を1回分消化する(残回数チェックは RPC 側で実施)
export async function consumeTicket(formData: FormData) {
  const customerTicketId = String(formData.get("customer_ticket_id"));
  const visitId = String(formData.get("visit_id"));

  const supabase = createClient();
  const { error } = await supabase.rpc("consume_ticket", {
    p_customer_ticket_id: customerTicketId,
    p_visit_id: visitId,
    p_used_count: 1,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/karte/${visitId}`);
}
