/** How to report a security problem (RFC 9116). */
export function GET() {
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const body = [
    "Contact: mailto:business@boringpe.com",
    `Expires: ${expires}T00:00:00.000Z`,
    "Preferred-Languages: en",
    "Canonical: https://boringpe.com/.well-known/security.txt",
    "Policy: Please report privately and give us reasonable time to fix before disclosure. Do not access or keep data that is not yours.",
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
