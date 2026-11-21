import { apiCaller, json } from "@/lib/api-auth";
import { listEntities } from "@/lib/books";
import { emit } from "@/lib/integrations";
import { createEntry, listMoney } from "@/lib/ops";
import { isCategory, oneLine, parseAmount, parseDate } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

export async function GET(request: Request) {
  const k = await apiCaller(request, "read");
  if (k instanceof Response) return k;
  const rows = await listMoney(200);
  return json({
    data: rows.map((m) => ({
      id: m.id, direction: m.direction, category: m.category, amount_inr: m.amount, currency: m.currency, memo: m.memo,
      status: m.status, date: m.entry_date, entity: m.entity_name, in_books: Boolean(m.journal_entry_id),
    })),
  });
}

/** Records money in. Payments out are never created by API: they need the Super Admin. */
export async function POST(request: Request) {
  const k = await apiCaller(request, "write:money");
  if (k instanceof Response) return k;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", message: "Send a JSON body." }, 400);
  }
  const amount = parseAmount(typeof body.amount === "number" ? String(body.amount) : body.amount);
  const category = body.category ?? "other";
  const entities = await listEntities();
  const entity = body.entity_id ? entities.find((e) => e.id === body.entity_id) : entities.find((e) => e.kind === "boring_pe");
  if (!amount || !isCategory(category) || !entity) {
    return json({ error: "invalid", message: "Need amount (rupees), a valid category and, optionally, entity_id." }, 422);
  }
  const memo = oneLine(body.memo, 300);
  const date = parseDate(body.date) ?? new Date().toISOString().slice(0, 10);
  const id = await createEntry({
    direction: "in", category, amount, memo, dealId: null, partyId: null, status: "recorded", date, by: k.created_by, entityId: entity.id,
  });
  await audit({ actorId: k.created_by, actorEmail: `api:${k.name} (${k.email})`, action: "money_in_recorded", detail: `${amount} ${memo}` });
  await emit("money.recorded", { id, direction: "in", amount_inr: amount, category, memo, entity: entity.name, date });
  return json({ id, status: "recorded", in_books: true }, 201);
}
