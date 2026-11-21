import { apiCaller, json } from "@/lib/api-auth";

export async function GET(request: Request) {
  const k = await apiCaller(request, "read");
  if (k instanceof Response) return k;
  return json({ key: k.name, scopes: k.scopes, acting_as: k.email });
}
