import { verifyApiKey } from "./integrations";

export type ApiCaller = NonNullable<Awaited<ReturnType<typeof verifyApiKey>>>;

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** The caller behind the request's API key, or the error response to return. */
export async function apiCaller(request: Request, scope: "read" | "write:money" | "write:tasks"): Promise<ApiCaller | Response> {
  const key = await verifyApiKey(request.headers.get("authorization"));
  if (!key) return json({ error: "unauthorized", message: "Send Authorization: Bearer <API key>." }, 401);
  if (!key.scopes.includes(scope)) return json({ error: "forbidden", message: `This key lacks the ${scope} scope.` }, 403);
  return key;
}
