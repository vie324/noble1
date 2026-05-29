import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export default async function CustomersPage() {
  const supabase = createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .order("name_kana");

  const list = (customers ?? []) as Customer[];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-ink">顧客</h1>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">カナ</th>
              <th className="px-4 py-3">電話</th>
              <th className="px-4 py-3">初回来店</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.name_kana}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                <td className="px-4 py-3 text-gray-500">{c.first_visit_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
