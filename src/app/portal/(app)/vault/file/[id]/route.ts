import { requireSection } from "@/lib/dal";
import { readDocument } from "@/lib/documents";
import { canSeeFirmData } from "@/lib/rbac";
import { safeFileName } from "@/lib/vault-fields";

/** Downloads one document if the signed-in person may see it. Always a download, never rendered inline. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("vault");
  const { id } = await params;
  const doc = await readDocument(id, user.id, canSeeFirmData(user.role));
  if (!doc) return new Response("Not found", { status: 404 });
  const name = safeFileName(doc.file_name);
  return new Response(Buffer.from(doc.content), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
