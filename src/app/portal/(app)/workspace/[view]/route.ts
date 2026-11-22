import { getCurrentUser } from "@/lib/dal";
import { views, type View } from "@/lib/workspace-calc";
import { setCurrentWorkspace } from "@/lib/workspaces";

// Relative redirects, so the browser stays on whichever host it came in on.
const to = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

/**
 * Switching workspace from the command palette, which navigates by link. It only changes which
 * workspace this person is looking at, never what they may open.
 */
export async function GET(request: Request, { params }: { params: Promise<{ view: string }> }) {
  // A prefetch must never switch anything.
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch" || request.headers.get("sec-purpose")?.includes("prefetch")) {
    return new Response(null, { status: 204 });
  }
  const { view } = await params;
  const user = await getCurrentUser();
  if (!user) return to("/portal/login");
  if ((views(user.role, user.workspaces) as string[]).includes(view)) await setCurrentWorkspace(user.id, view as View);
  return to("/portal/dashboard");
}
