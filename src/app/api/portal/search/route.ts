import { getCurrentUser } from "@/lib/dal";
import { getSql } from "@/lib/db";
import { canManagePeople, canSeeFirmData } from "@/lib/rbac";

type Hit = { label: string; href: string; hint: string };

/** Records for the command palette, only those the signed-in person may open. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.must_change_password) return Response.json({ results: [] }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ results: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const sql = await getSql();
  const results: Hit[] = [];
  const add = async (text: string, params: unknown[], map: (r: Record<string, string>) => Hit) => {
    const rows = await sql.query<Record<string, string>>(text, params);
    results.push(...rows.map(map));
  };
  if (canSeeFirmData(user.role)) {
    await Promise.all([
      add(`select i.id, coalesce(i.number, 'Draft') as number, p.name from invoices i join parties p on p.id = i.party_id
            where i.number ilike $1 or p.name ilike $1 order by i.created_at desc limit 6`, [like],
        (r) => ({ label: `${r.number} · ${r.name}`, href: `/portal/invoices?inv=${r.id}`, hint: "Invoice" })),
      add("select id, name, stage from deals where name ilike $1 order by updated_at desc limit 5", [like],
        (r) => ({ label: r.name, href: "/portal/deals", hint: `Deal · ${r.stage.replace("_", " ")}` })),
      add("select id, name from ventures where name ilike $1 limit 5", [like],
        (r) => ({ label: r.name, href: `/portal/ventures?v=${r.id}`, hint: "Venture" })),
      add("select id, name from holdings where name ilike $1 limit 5", [like],
        (r) => ({ label: r.name, href: `/portal/portfolio?h=${r.id}`, hint: "Holding" })),
      add("select id, name, kind from entities where name ilike $1 limit 5", [like],
        (r) => ({ label: r.name, href: `/portal/books?e=${r.id}`, hint: "Books" })),
      add("select id, name from parties where name ilike $1 or gstin ilike $1 limit 5", [like],
        (r) => ({ label: r.name, href: "/portal/invoices?view=settings", hint: "Contact" })),
      ...(canManagePeople(user.role)
        ? [add("select id, name, designation from employees where name ilike $1 or email ilike $1 limit 5", [like],
            (r) => ({ label: r.name, href: `/portal/people?emp=${r.id}`, hint: r.designation || "Person" }))]
        : []),
    ]);
  } else {
    await add(
      `select v.id, v.name from ventures v where v.name ilike $2 and (
         exists (select 1 from venture_operators o where o.venture_id = v.id and o.user_id = $1)
         or exists (select 1 from access_scopes s where s.scope_type = 'venture' and s.ref_id = v.id and s.user_id = $1)) limit 5`,
      [user.id, like], (r) => ({ label: r.name, href: `/portal/ventures?v=${r.id}`, hint: "Venture" }),
    );
  }
  await add("select id, title from tasks where title ilike $2 and ($3::boolean or assignee_id = $1 or created_by = $1) limit 5",
    [user.id, like, canSeeFirmData(user.role)], (r) => ({ label: r.title, href: "/portal/tasks", hint: "Task" }));
  return Response.json({ results: results.slice(0, 25) });
}
