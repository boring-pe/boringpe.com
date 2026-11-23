import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTree, change, figuresOf, findNode, flatten, monthEnds, pathTo, type Unit } from "../src/lib/networth-calc.ts";

const unit = (u: Partial<Unit> & Pick<Unit, "id" | "name" | "kind" | "workspace">): Unit => ({
  parentId: null, assets: 0n, liabilities: 0n, income: 0n, expense: 0n, cost: 0n, value: 0n, fees: 0n, ...u,
});

const units: Unit[] = [
  unit({ id: "me", name: "Rahul Mane (Personal)", kind: "personal", workspace: "personal", assets: 50_000_00n, liabilities: 10_000_00n, expense: 5_000_00n, cost: 20_000_00n, value: 30_000_00n }),
  unit({ id: "bpe", name: "Boring PE", kind: "boring_pe", workspace: "boring_pe", assets: 100_000_00n, liabilities: 40_000_00n, income: 12_000_00n, expense: 4_000_00n }),
  unit({ id: "spv", name: "Alpha SPV", kind: "spv", workspace: "boring_pe", parentId: "bpe", assets: 30_000_00n, liabilities: 5_000_00n, income: 20_000_00n, expense: 8_000_00n, fees: 2_000_00n }),
  unit({ id: "cafe", name: "Cafe", kind: "venture", workspace: "boring_pe", parentId: "spv", assets: 6_000_00n }),
  unit({ id: "im", name: "Impact Marrow", kind: "impact_marrow", workspace: "impact_marrow", assets: 9_000_00n }),
];

test("the levels: everything, then Rahul Mane, Boring PE and Impact Marrow, then each unit under its parent", () => {
  const tree = buildTree(units);
  assert.deepEqual(tree.children.map((c) => c.name), ["Rahul Mane", "Boring PE", "Impact Marrow"]);
  assert.deepEqual(flatten(tree).map((n) => `${n.depth}:${n.name}`), [
    "0:All of it together", "1:Rahul Mane", "2:Rahul Mane (Personal)", "1:Boring PE", "2:Boring PE", "3:Alpha SPV", "4:Cafe", "1:Impact Marrow", "2:Impact Marrow",
  ]);
  assert.deepEqual([...findNode(tree, "spv")!.ids].sort(), ["cafe", "spv"]);
  assert.deepEqual(pathTo(tree, "cafe").map((n) => n.key), ["all", "ws:boring_pe", "bpe", "spv", "cafe"]);
});

test("a parent in another workspace, or a loop of parents, does not hide a unit", () => {
  const odd = [
    unit({ id: "a", name: "A", kind: "spv", workspace: "boring_pe", parentId: "b" }),
    unit({ id: "b", name: "B", kind: "spv", workspace: "boring_pe", parentId: "a" }),
    unit({ id: "c", name: "C", kind: "fund", workspace: "impact_marrow", parentId: "a" }),
  ];
  const tree = buildTree(odd);
  assert.equal(flatten(tree).filter((n) => n.level === "unit").length, 3);
  assert.ok(findNode(tree, "ws:impact_marrow")!.ids.has("c"));
});

test("one unit: assets less liabilities, and investments at market value", () => {
  const f = figuresOf(new Set(["me"]), units, [], [], new Set(["bpe"]));
  assert.equal(f.netWorth, 40_000_00n);
  assert.equal(f.marketNetWorth, 50_000_00n, "₹10,000 of unrealised gain on top");
  assert.equal(f.net, -5_000_00n);
});

test("a level counts money that moves inside it once", () => {
  const stakes = [{ holder: "me", target: "spv", cost: 15_000_00n, value: 22_000_00n }, { holder: "me", target: null, cost: 5_000_00n, value: 8_000_00n }];
  const gifts = [{ from: "me", to: "im", amount: 3_000_00n }];
  const earners = new Set(["bpe"]);

  // Boring PE alone with its SPV: the SPV's fee is Boring PE's income, so both sides drop out.
  const firm = figuresOf(findNode(buildTree(units), "ws:boring_pe")!.ids, units, gifts, stakes, earners);
  assert.equal(firm.income, 30_000_00n);
  assert.equal(firm.expense, 10_000_00n);
  assert.equal(firm.internal.fees, 2_000_00n);
  assert.equal(firm.netWorth, 91_000_00n);

  // The SPV without Boring PE still pays the fee.
  assert.equal(figuresOf(new Set(["spv", "cafe"]), units, gifts, stakes, earners).expense, 8_000_00n);

  // Everything together: Rahul's stake in the SPV is dropped (the SPV's books carry it) and the gift is not an expense.
  const all = figuresOf(new Set(units.map((u) => u.id)), units, gifts, stakes, earners);
  assert.equal(all.internal.stakesCost, 15_000_00n);
  assert.equal(all.assets, 195_000_00n - 15_000_00n);
  assert.equal(all.netWorth, 180_000_00n - 55_000_00n);
  assert.equal(all.cost, 5_000_00n);
  assert.equal(all.value, 8_000_00n);
  assert.equal(all.marketNetWorth, all.netWorth + 3_000_00n);
  assert.equal(all.expense, 17_000_00n - 2_000_00n - 3_000_00n);
  assert.equal(all.income, 32_000_00n - 2_000_00n, "the gift was capital to Impact Marrow, never income");
});

test("month ends and change", () => {
  assert.deepEqual(monthEnds("2026-11-23", 3), ["2026-09-30", "2026-10-31", "2026-11-30"]);
  assert.deepEqual(monthEnds("2026-03-05", 2), ["2026-02-28", "2026-03-31"]);
  assert.equal(change(100_00n, 150_00n), 50);
  assert.equal(change(-100_00n, -50_00n), 50, "a smaller deficit is an improvement");
  assert.equal(change(0n, 10n), null);
});
