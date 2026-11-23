import { Compass } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { GUIDES, progress } from "@/lib/guides-calc";
import { guideFacts } from "@/lib/guides";
import { can, type SectionId } from "@/lib/rbac";
import { Checklist } from "./checklist";

/** Step-by-step workflows for the everyday jobs, ticked off from what is already in the portal. */
export default async function GuidesPage() {
  const user = await requireSection("guides");
  const facts = await guideFacts(user.id);
  const canOpen = (s: string) => s === "personal" || can(user.role, s as SectionId);
  const guides = GUIDES.filter((g) => !g.ownerOnly || user.role === "super_admin")
    .map((g) => ({ g, p: progress(g, facts, canOpen) }))
    .filter(({ p }) => p.steps.length > 0);
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-400"><Compass className="h-4 w-4" />Guides</div>
        <h2 className="mt-2 text-2xl font-bold text-white">How to get things done</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Each job step by step. Steps tick themselves off from what is already in the portal; click one to go straight there. Press <kbd className="rounded border border-slate-700 px-1 font-mono text-xs">?</kbd> anywhere for keyboard shortcuts.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {guides.map(({ g, p }) => <Checklist key={g.id} id={g.id} title={g.title} summary={g.summary} p={p} />)}
      </div>
    </div>
  );
}
