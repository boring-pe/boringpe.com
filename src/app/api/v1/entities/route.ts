import { apiCaller, json } from "@/lib/api-auth";
import { listEntities } from "@/lib/books";

export async function GET(request: Request) {
  const k = await apiCaller(request, "read");
  if (k instanceof Response) return k;
  const entities = await listEntities();
  return json({ data: entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, parent: e.parent_name })) });
}
