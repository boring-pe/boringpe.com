import { requireUser } from "@/lib/dal";
import { getPrefs } from "@/lib/prefs";
import { ACCENTS } from "@/lib/prefs-fields";
import { saveAppearance } from "../_shell/prefs-actions";
import { ROLE_META } from "@/lib/rbac";
import { endMySessions } from "./actions";
import { PasswordChangeForm } from "./password-form";
import { TwoStep } from "./two-step";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ enroll?: string; tf?: string }> }) {
  const user = await requireUser();
  const { enroll, tf } = await searchParams;
  const prefs = await getPrefs(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Account</h2>
        <p className="mt-2 text-sm text-slate-400">
          {user.email} · {ROLE_META[user.role].label}
        </p>
      </div>

      {user.must_change_password ? (
        <p role="status" data-persist className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          You are on a temporary password. Choose your own to open the rest of the portal.
        </p>
      ) : null}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6" data-appearance>
        <h3 className="text-sm font-semibold text-white">Appearance</h3>
        <p className="mt-1 mb-5 text-xs text-slate-500">Just for you, on every device you sign in from.</p>
        <form action={saveAppearance} className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Theme</legend>
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              {[["system", "Device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => (
                <label key={v} className="cursor-pointer rounded-lg border border-slate-700 p-3 text-center text-sm text-slate-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/10 has-[:checked]:text-white">
                  <input type="radio" name="theme" value={v} defaultChecked={prefs.theme === v} className="sr-only" />
                  <span className={`mx-auto mb-2 block h-8 w-12 rounded border border-slate-700 ${v === "light" ? "bg-[#f5f2ea]" : v === "dark" ? "bg-[#0a0f1a]" : "bg-gradient-to-r from-[#f5f2ea] to-[#0a0f1a]"}`} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Accent colour</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 py-1.5 pl-1.5 pr-3 text-sm text-slate-300 has-[:checked]:border-blue-500 has-[:checked]:text-white">
                  <input type="radio" name="accent" value={a.id} defaultChecked={prefs.accent === a.id} className="sr-only" />
                  <span className="h-5 w-5 rounded-full" style={{ background: a.swatch }} />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Density</legend>
            <div className="flex gap-2">
              {[["comfortable", "Comfortable"], ["compact", "Compact"]].map(([v, l]) => (
                <label key={v} className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/10 has-[:checked]:text-white">
                  <input type="radio" name="density" value={v} defaultChecked={prefs.density === v} className="sr-only" />{l}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Save appearance</button>
        </form>
        <p className="mt-4 text-xs text-slate-500">Pin pages from the sidebar: hover a page and tap the pin.</p>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          {user.password_hash ? "Change password" : "Add a password"}
        </h3>
        <PasswordChangeForm hasPassword={Boolean(user.password_hash)} />
      </section>

      <TwoStep user={user} enroll={enroll === "1"} tf={tf} />

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white">Sessions</h3>
        <p className="mt-2 text-sm text-slate-400 max-w-md">
          Signs you out on every device, including this one.
        </p>
        <form action={endMySessions} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Sign out everywhere
          </button>
        </form>
      </section>
    </div>
  );
}
