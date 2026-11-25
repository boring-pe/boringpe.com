import { Check, ChevronsUpDown } from "lucide-react";
import { WORKSPACES, workspaceLabel, type View } from "@/lib/workspace-calc";
import { switchWorkspace } from "./prefs-actions";

/** Letter and colour that mark each workspace, so it is clear at a glance where you are. */
export const WORKSPACE_MARK: Record<View, { letter: string; tone: string }> = {
  personal: { letter: "R", tone: "bg-amber-600" },
  boring_pe: { letter: "B", tone: "bg-blue-600" },
  impact_marrow: { letter: "M", tone: "bg-teal-600" },
  all: { letter: "∑", tone: "bg-slate-600" },
};

const NOTE: Record<View, string> = {
  ...(Object.fromEntries(WORKSPACES.map((w) => [w.id, w.note])) as Record<string, string>),
  all: "The three together",
} as Record<View, string>;

function Mark({ view }: { view: View }) {
  const m = WORKSPACE_MARK[view];
  return <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-serif text-lg font-semibold text-white shadow-sm ${m.tone}`}>{m.letter}</div>;
}

/**
 * The sidebar heading. With more than one workspace it opens a list to switch; a native <details>
 * so it works before any script loads.
 */
export function WorkspaceSwitcher({ view, views }: { view: View; views: View[] }) {
  const title = (
    <>
      <Mark view={view} />
      <div className="rail-hide min-w-0 flex-1 leading-tight">
        <div className="truncate font-serif text-base font-semibold tracking-tight text-white" data-workspace-current>{workspaceLabel(view)}</div>
        <div className="truncate text-[11px] uppercase tracking-[0.18em] text-slate-500">{views.length > 1 ? "Workspace" : "Portal"}</div>
      </div>
    </>
  );
  if (views.length < 2) return <div className="flex items-center gap-3">{title}</div>;
  return (
    <details className="group relative w-full" data-workspace-switcher>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-1 -m-1 hover:bg-slate-800/60 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronsUpDown className="rail-hide h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="sr-only">Switch workspace</span>
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[15rem] rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-xl">
        {views.map((v) => (
          <form key={v} action={switchWorkspace.bind(null, v)}>
            <button
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800/60 ${v === "all" ? "mt-1 border-t border-slate-800 pt-2.5" : ""}`}
              data-workspace={v}
              aria-current={v === view ? "true" : undefined}
            >
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-serif text-sm font-semibold text-white ${WORKSPACE_MARK[v].tone}`}>{WORKSPACE_MARK[v].letter}</div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{workspaceLabel(v)}</span>
                <span className="block truncate text-xs text-slate-500">{NOTE[v]}</span>
              </span>
              {v === view ? <Check className="h-4 w-4 text-blue-400" aria-hidden /> : null}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
