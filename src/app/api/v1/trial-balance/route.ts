import { apiCaller, json } from "@/lib/api-auth";
import { paiseToDecimal, trialBalance } from "@/lib/accounting";
import { balances, listEntities } from "@/lib/books";

export async function GET(request: Request) {
  const k = await apiCaller(request, "read");
  if (k instanceof Response) return k;
  const url = new URL(request.url);
  const entity = (await listEntities()).find((e) => e.id === url.searchParams.get("entity"));
  if (!entity) return json({ error: "not_found", message: "Pass ?entity=<id> from /api/v1/entities." }, 404);
  const to = url.searchParams.get("to");
  const tb = trialBalance(await balances(entity.id, null, to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null));
  return json({
    entity: entity.name, balanced: tb.balanced, debit: paiseToDecimal(tb.debit), credit: paiseToDecimal(tb.credit),
    lines: tb.lines.map((l) => ({ code: l.code, name: l.name, type: l.type, debit: paiseToDecimal(l.debit), credit: paiseToDecimal(l.credit) })),
  });
}
