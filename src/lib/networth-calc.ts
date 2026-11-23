// Pure net worth maths in paise: the tree of units and each level's figures. No imports, so the
// test runner can load it directly.

/** One entity's own figures. Balances are as of the end date; flows are for the period. */
export type Unit = {
  id: string;
  name: string;
  kind: string;
  workspace: string;
  parentId: string | null;
  assets: bigint;
  liabilities: bigint;
  income: bigint;
  expense: bigint;
  /** What it paid for investments it still holds, and what they are worth now. */
  cost: bigint;
  value: bigint;
  /** Boring Studio fees it was charged in the period (account 5100). */
  fees: bigint;
};

/** A gift between two units in the period. */
export type Transfer = { from: string | null; to: string; amount: bigint };
/** An investment one unit holds in another. */
export type Stake = { holder: string; target: string | null; cost: bigint; value: bigint };

export type Figures = {
  assets: bigint;
  liabilities: bigint;
  /** Book net worth: assets less liabilities. */
  netWorth: bigint;
  /** Net worth with investments at their latest value instead of cost. */
  marketNetWorth: bigint;
  income: bigint;
  expense: bigint;
  net: bigint;
  cost: bigint;
  value: bigint;
  /** Amounts taken out because both sides sit inside this level. */
  internal: { fees: bigint; transfers: bigint; stakesCost: bigint; stakesValue: bigint };
};

const ZERO = 0n;

/**
 * Adds up a set of units, counting money that moves inside the set once:
 * - Boring Studio fees, when the fee earner (Boring PE) is inside, are neither income nor expense;
 * - a gift between two units inside is not an expense (the receiver books it as capital);
 * - a stake one unit holds in another unit inside is dropped, since the company's own books
 *   already carry what it owns and owes.
 */
export function figuresOf(ids: ReadonlySet<string>, units: readonly Unit[], transfers: readonly Transfer[], stakes: readonly Stake[], feeEarners: ReadonlySet<string>): Figures {
  const inside = units.filter((u) => ids.has(u.id));
  const sum = (f: (u: Unit) => bigint) => inside.reduce((s, u) => s + f(u), ZERO);
  const earnerInside = [...feeEarners].some((id) => ids.has(id));
  const fees = earnerInside ? inside.filter((u) => !feeEarners.has(u.id)).reduce((s, u) => s + u.fees, ZERO) : ZERO;
  const gifts = transfers.filter((t) => t.from && ids.has(t.from) && ids.has(t.to)).reduce((s, t) => s + t.amount, ZERO);
  const held = stakes.filter((s) => ids.has(s.holder) && s.target && ids.has(s.target));
  const stakesCost = held.reduce((s, x) => s + x.cost, ZERO);
  const stakesValue = held.reduce((s, x) => s + x.value, ZERO);

  const assets = sum((u) => u.assets) - stakesCost;
  const liabilities = sum((u) => u.liabilities);
  const cost = sum((u) => u.cost) - stakesCost;
  const value = sum((u) => u.value) - stakesValue;
  // A gift is the giver's expense and the receiver's capital, so only the expense drops out.
  const income = sum((u) => u.income) - fees;
  const expense = sum((u) => u.expense) - fees - gifts;
  const netWorth = assets - liabilities;
  return {
    assets, liabilities, netWorth, marketNetWorth: netWorth + (value - cost),
    income, expense, net: income - expense, cost, value,
    internal: { fees, transfers: gifts, stakesCost, stakesValue },
  };
}

export const WORKSPACE_ORDER = ["personal", "boring_pe", "impact_marrow"] as const;
export const LEVEL_NAMES: Record<string, string> = { personal: "Rahul Mane", boring_pe: "Boring PE", impact_marrow: "Impact Marrow" };

export type Node = {
  /** "all", "ws:<workspace>" or an entity id. */
  key: string;
  name: string;
  level: "all" | "workspace" | "unit";
  kind: string | null;
  depth: number;
  /** Every entity id this level covers. */
  ids: Set<string>;
  children: Node[];
};

/**
 * The levels: everything together, then each workspace (Rahul Mane, Boring PE, Impact Marrow),
 * then each unit under its parent within the same workspace, as deep as the parents go.
 */
export function buildTree(units: readonly Pick<Unit, "id" | "name" | "kind" | "workspace" | "parentId">[]): Node {
  const byId = new Map(units.map((u) => [u.id, u]));
  const kids = new Map<string, typeof units[number][]>();
  const roots = new Map<string, typeof units[number][]>();
  for (const u of units) {
    const parent = u.parentId ? byId.get(u.parentId) : undefined;
    if (parent && parent.workspace === u.workspace && !isAncestor(u.id, parent.id, byId)) {
      kids.set(parent.id, [...(kids.get(parent.id) ?? []), u]);
    } else {
      roots.set(u.workspace, [...(roots.get(u.workspace) ?? []), u]);
    }
  }
  // Each workspace's main entity first, then by name.
  const main = new Set(["boring_pe", "impact_marrow", "personal"]);
  const order = (a: typeof units[number], b: typeof units[number]) => Number(main.has(b.kind)) - Number(main.has(a.kind)) || a.name.localeCompare(b.name);

  const unitNode = (u: typeof units[number], depth: number): Node => {
    const children = (kids.get(u.id) ?? []).sort(order).map((c) => unitNode(c, depth + 1));
    const ids = new Set([u.id, ...children.flatMap((c) => [...c.ids])]);
    return { key: u.id, name: u.name, level: "unit", kind: u.kind, depth, ids, children };
  };
  const workspaces = WORKSPACE_ORDER.filter((w) => roots.has(w)).map((w): Node => {
    const children = roots.get(w)!.sort(order).map((u) => unitNode(u, 2));
    return { key: `ws:${w}`, name: LEVEL_NAMES[w], level: "workspace", kind: w, depth: 1, ids: new Set(children.flatMap((c) => [...c.ids])), children };
  });
  return { key: "all", name: "All of it together", level: "all", kind: null, depth: 0, ids: new Set(units.map((u) => u.id)), children: workspaces };
}

/** Whether `ancestor` already sits above `id`, which would make a loop. */
function isAncestor(id: string, start: string, byId: Map<string, { parentId: string | null }>): boolean {
  const seen = new Set<string>();
  for (let cur: string | null = start; cur; cur = byId.get(cur)?.parentId ?? null) {
    if (cur === id) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
  }
  return false;
}

/** The tree in reading order, for a table. */
export function flatten(node: Node): Node[] {
  return [node, ...node.children.flatMap(flatten)];
}

export function findNode(node: Node, key: string): Node | null {
  if (node.key === key) return node;
  for (const c of node.children) {
    const hit = findNode(c, key);
    if (hit) return hit;
  }
  return null;
}

/** The path from the top down to a node, for breadcrumbs. */
export function pathTo(node: Node, key: string): Node[] {
  if (node.key === key) return [node];
  for (const c of node.children) {
    const p = pathTo(c, key);
    if (p.length) return [node, ...p];
  }
  return [];
}

/** The last day of each of the `count` months ending with the month of `to`, oldest first. */
export function monthEnds(to: string, count: number): string[] {
  const [y, m] = to.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i + 1, 0));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Percent change from `before` to `after`, or null when there is nothing to compare with. */
export function change(before: bigint, after: bigint): number | null {
  if (before === 0n) return null;
  const sign = before < 0n ? -1n : 1n;
  return Number(((after - before) * 10000n * sign) / before) / 100;
}
