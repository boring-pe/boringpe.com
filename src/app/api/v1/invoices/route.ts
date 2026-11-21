import { apiCaller, json } from "@/lib/api-auth";
import { listInvoices } from "@/lib/invoices";

export async function GET(request: Request) {
  const k = await apiCaller(request, "read");
  if (k instanceof Response) return k;
  const status = new URL(request.url).searchParams.get("status");
  const rows = (await listInvoices()).filter((i) => !status || i.status === status);
  return json({
    data: rows.map((i) => ({
      id: i.id, number: i.number, status: i.status, entity: i.entity_name, customer: i.party_name, issue_date: i.issue_date,
      due_date: i.due_date, currency: i.currency, total_inr: i.total, received_inr: i.received, tds_inr: i.tds,
    })),
  });
}
