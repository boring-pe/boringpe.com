import { ShieldCheck } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { ROLES, ROLE_META, SECTIONS, assignableRoles, can, canManageRole } from "@/lib/rbac";
import { listAudit, listUsers } from "@/lib/users";
import { SHARED_WORKSPACES, enterable, workspaceLabel } from "@/lib/workspace-calc";
import { changeRole, saveTwoStepRoles, setWorkspaces, signOutEverywhere, toggleStatus } from "./actions";
import { requiredRoles } from "@/lib/mfa";
import { getSql } from "@/lib/db";
import { InviteForm, ResetPasswordForm } from "./access-forms";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  "role-saved": { text: "Role updated." },
  disabled: { text: "Seat switched off. Their sessions end on the next request." },
  enabled: { text: "Seat switched back on." },
  revoked: { text: "Their sessions were ended." },
  self: { text: "You cannot change your own seat here.", bad: true },
  "last-admin": { text: "That would leave no active Super Admin.", bad: true },
  "not-allowed": { text: "Only the Super Admin can change that seat.", bad: true },
  unchanged: { text: "Nothing changed.", bad: true },
  "two-step-saved": { text: "Two-step sign-in requirement saved. Those seats set it up at their next visit." },
  "workspaces-saved": { text: "Workspaces updated. They apply on the next request." },
  "no-workspace": { text: "A seat needs at least one workspace.", bad: true },
  invalid: { text: "That request was not valid.", bad: true },
};

const card = "bg-slate-900 border border-slate-800 rounded-xl";
const small = "text-xs font-semibold text-blue-400 hover:text-blue-300";

function when(value: Date | null) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "Never";
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const me = await requireSection("access");
  const { notice } = await searchParams;
  const [users, events, twoStepRoles, twoStepOn] = await Promise.all([
    listUsers(), listAudit(25), requiredRoles(),
    getSql().then((sql) => sql.query<{ id: string }>("select id from users where totp_enabled")).then((r) => new Set(r.map((x) => x.id))),
  ]);
  const banner = notice ? NOTICES[notice] : undefined;
  const roles = assignableRoles(me.role);
  const mine = enterable(me.role, me.workspaces).filter((w) => SHARED_WORKSPACES.includes(w));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold tracking-wide uppercase">
          <ShieldCheck className="w-4 h-4" />
          Role-based access
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Access Control</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Nobody can sign in without a seat. Invite people here, give each a role, and switch seats
          off when someone leaves. Changes apply on their next request.
        </p>
      </div>

      {banner ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.bad
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-blue-500/30 bg-blue-500/10 text-blue-200"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {me.role === "super_admin" ? (
        <section className={`${card} p-6`} data-two-step-roles>
          <h3 className="text-sm font-semibold text-white">Two-step sign-in</h3>
          <p className="mt-1 text-xs text-slate-500">Roles ticked here must use an authenticator app code after signing in. They are asked to set it up on their next visit.</p>
          <form action={saveTwoStepRoles} className="mt-3 flex flex-wrap items-center gap-4">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" name="roles" value={r} defaultChecked={twoStepRoles.includes(r)} />{ROLE_META[r].label}
              </label>
            ))}
            <button type="submit" className={small}>Save</button>
          </form>
        </section>
      ) : null}

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Invite someone</h3>
        <InviteForm roles={roles} workspaces={mine.map((w) => ({ id: w, label: workspaceLabel(w) }))} />
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Seats ({users.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Workspaces</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last sign-in (UTC)</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const self = user.id === me.id;
                const manageable = !self && canManageRole(me.role, user.role);
                return (
                  <tr key={user.id} className="border-t border-slate-800/80 align-top">
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">
                        {user.name ?? user.email} {self ? <span className="text-xs text-slate-500">(you)</span> : null}
                      </div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      {!manageable ? (
                        <span className="text-slate-300">{ROLE_META[user.role].label}</span>
                      ) : (
                        <form action={changeRole} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <select
                            name="role"
                            defaultValue={user.role}
                            aria-label={`Role for ${user.email}`}
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_META[role].label}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={small}>
                            Save
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-4" data-workspaces={user.email}>
                      <div className={`mb-1 text-xs ${twoStepOn.has(user.id) ? "text-green-400" : "text-slate-500"}`} data-two-step-state={user.email}>{twoStepOn.has(user.id) ? "Two-step on" : "Password only"}</div>
                      {user.role === "super_admin" ? (
                        <span className="text-slate-300">All three, including Personal</span>
                      ) : !manageable ? (
                        <span className="text-slate-300">{user.workspaces.map(workspaceLabel).join(", ")}</span>
                      ) : (
                        <form action={setWorkspaces} className="space-y-1">
                          <input type="hidden" name="userId" value={user.id} />
                          {SHARED_WORKSPACES.map((w) => (
                            <label key={w} className={`flex items-center gap-2 text-xs ${mine.includes(w) ? "text-slate-300" : "text-slate-600"}`}>
                              <input type="checkbox" name="workspace" value={w} defaultChecked={user.workspaces.includes(w)} disabled={!mine.includes(w)} />
                              {workspaceLabel(w)}
                            </label>
                          ))}
                          <button type="submit" className={small}>Save</button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={user.status === "active" ? "text-green-400" : "text-slate-500"}>
                        {user.status === "active" ? "Active" : "Off"}
                      </span>
                      {user.must_change_password ? (
                        <div className="text-xs text-amber-400">Temporary password</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-slate-400">{when(user.last_sign_in_at)}</td>
                    <td className="px-4 py-4">
                      {!manageable ? (
                        <span className="text-xs text-slate-600">
                          {self ? "Use Account" : "Super Admin only"}
                        </span>
                      ) : (
                        <div className="space-y-2">
                          <form action={toggleStatus}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="to" value={user.status === "active" ? "disabled" : "active"} />
                            <button type="submit" className={small}>
                              {user.status === "active" ? "Switch off" : "Switch on"}
                            </button>
                          </form>
                          <ResetPasswordForm userId={user.id} />
                          <form action={signOutEverywhere}>
                            <input type="hidden" name="userId" value={user.id} />
                            <button type="submit" className={small}>
                              End sessions
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Permission matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 font-medium">Section</th>
                {ROLES.map((item) => (
                  <th key={item} className="px-4 py-3 font-medium">
                    {ROLE_META[item].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <tr key={section.id} className="border-t border-slate-800/80">
                  <td className="px-6 py-3 text-white">{section.label}</td>
                  {ROLES.map((item) => (
                    <td key={item} className="px-4 py-3">
                      <span className={can(item, section.id) ? "text-blue-400" : "text-slate-600"}>
                        {can(item, section.id) ? "Open" : "Closed"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Recent changes</h3>
        </div>
        {events.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 text-sm">
            {events.map((event) => (
              <li key={event.id} className="px-6 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-slate-500">{when(event.created_at)}</span>
                <span className="text-white">{event.action.replace(/_/g, " ")}</span>
                {event.target_email ? <span className="text-slate-300">{event.target_email}</span> : null}
                {event.detail ? <span className="text-slate-500">{event.detail}</span> : null}
                <span className="text-xs text-slate-600">by {event.actor_email ?? "system"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
