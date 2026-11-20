import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { setPortalRole } from "./actions";
import {
  MEMBERS,
  ROLE_META,
  ROLES,
  SECTIONS,
  can,
  parseRole,
  type Role,
} from "@/lib/rbac";

export default async function AccessPage() {
  const jar = await cookies();
  const role = parseRole(jar.get("bp_preview")?.value);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold tracking-wide uppercase">
            <ShieldCheck className="w-4 h-4" />
            Role-based access
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">Access Control</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Each desk opens only the sections granted to its role. Only the Super Admin account can assume another role.
          </p>
        </div>
        <div className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
          <div className="text-xs text-slate-500">Current seat</div>
          <div className="text-sm font-semibold text-white">{ROLE_META[role].label}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ROLES.map((item) => (
          <RoleCard key={item} item={item} active={item === role} canAssume={role === "superadmin"} />
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                      <span
                        className={
                          can(item, section.id) ? "text-blue-400" : "text-slate-600"
                        }
                      >
                        {can(item, section.id) ? "Open" : "Closed"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Directory</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 font-medium">Seat</th>
              <th className="px-6 py-3 font-medium">Role</th>
              <th className="px-6 py-3 font-medium">Scope</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((member) => (
              <tr key={member.email} className="border-t border-slate-800/80">
                <td className="px-6 py-4">
                  <div className="text-white font-medium">{member.name}</div>
                  <div className="text-xs text-slate-500">{member.email}</div>
                </td>
                <td className="px-6 py-4 text-slate-300">{ROLE_META[member.role].label}</td>
                <td className="px-6 py-4 text-slate-400">{member.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleCard({
  item,
  active,
  canAssume,
}: {
  item: Role;
  active: boolean;
  canAssume: boolean;
}) {
  const meta = ROLE_META[item];
  return (
    <form
      action={canAssume ? setPortalRole : undefined}
      className={`p-4 rounded-xl border ${
        active ? "bg-blue-500/10 border-blue-500/40" : "bg-slate-900 border-slate-800"
      }`}
    >
      <input type="hidden" name="role" value={item} />
      <div className="text-sm font-semibold text-white">{meta.label}</div>
      <p className="mt-2 text-xs text-slate-400 min-h-12">{meta.detail}</p>
      {canAssume && (
        <button
          type="submit"
          className="mt-4 text-xs font-semibold text-blue-400 hover:text-blue-300"
        >
          {active ? "Current role" : "Assume role"}
        </button>
      )}
    </form>
  );
}
