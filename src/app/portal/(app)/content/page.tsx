import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { getSiteContent } from "@/lib/content";
import { isSiteId, SITES, type SiteId } from "@/lib/content-fields";
import { resetContent, saveContent } from "./actions";

const NOTICES: Record<string, string> = {
  saved: "Saved. The public page updates within a minute.",
  unchanged: "Nothing changed.",
  reset: "Back to the original wording.",
};

const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; notice?: string; error?: string }>;
}) {
  await requireSection("content");
  const params = await searchParams;
  const site: SiteId = isSiteId(params.site) ? params.site : "boringpe";
  const meta = SITES[site];
  const content = await getSiteContent(site);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Site content</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Edit the words on the public pages. Text only: nothing here can add scripts or links to a page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SITES) as SiteId[]).map((id) => (
          <Link
            key={id}
            href={`/portal/content?site=${id}`}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              id === site ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {SITES[id].label} <span className="text-xs opacity-70">{SITES[id].where}</span>
          </Link>
        ))}
        <a href={meta.path} target="_blank" rel="noreferrer" className="ml-auto text-sm text-blue-400 hover:text-blue-300">
          View page
        </a>
      </div>

      {params.notice && NOTICES[params.notice] ? (
        <p role="status" className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          {NOTICES[params.notice]}
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {params.error}
        </p>
      ) : null}

      <form action={saveContent} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <input type="hidden" name="site" value={site} />
        {meta.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-slate-400">
              <span>{field.label}</span>
              <span className="text-slate-600">max {field.max}</span>
            </span>
            {field.multiline ? (
              <textarea
                name={field.key}
                defaultValue={content[field.key]}
                maxLength={field.max}
                rows={field.max > 300 ? 5 : 3}
                className={input}
              />
            ) : (
              <input
                name={field.key}
                type={field.email ? "email" : "text"}
                defaultValue={content[field.key]}
                maxLength={field.max}
                className={input}
              />
            )}
            {field.help ? <span className="mt-1 block text-xs text-slate-600">{field.help}</span> : null}
          </label>
        ))}
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Save and publish
        </button>
      </form>

      <form action={resetContent}>
        <input type="hidden" name="site" value={site} />
        <button type="submit" className="text-xs font-semibold text-slate-400 hover:text-white">
          Restore the original wording for {meta.label}
        </button>
      </form>
    </div>
  );
}
