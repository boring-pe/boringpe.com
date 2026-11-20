import { requireUser } from "@/lib/dal";
import { ROLE_META } from "@/lib/rbac";
import { endMySessions } from "./actions";
import { PasswordChangeForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Account</h2>
        <p className="mt-2 text-sm text-slate-400">
          {user.email} · {ROLE_META[user.role].label}
        </p>
      </div>

      {user.must_change_password ? (
        <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          You are on a temporary password. Choose your own to open the rest of the portal.
        </p>
      ) : null}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          {user.password_hash ? "Change password" : "Add a password"}
        </h3>
        <PasswordChangeForm hasPassword={Boolean(user.password_hash)} />
      </section>

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
