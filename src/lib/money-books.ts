// Pure: which accounts a Money entry posts to. Kept free of imports so tests load it directly.

type Line = { code: string; debit: bigint; credit: bigint };

/** Money in: the bank against the account the category names. */
const IN_ACCOUNT: Record<string, string> = {
  investment: "3010", // capital received
  fee: "4010", // management fees
  payout: "4030", // investment income, dividends, distributions
  expense: "4900", // refunds and recoveries
  salary: "4900",
  other: "4900",
};

/** Money out: the account the category names against the bank. */
const OUT_ACCOUNT: Record<string, string> = {
  investment: "1200", // investments
  fee: "5020", // professional fees
  expense: "5900", // other expenses
  payout: "5080", // operator revenue share
  salary: "5010", // salaries
  other: "5900",
};

export function moneyLines(direction: "in" | "out", category: string, amount: bigint): Line[] {
  if (direction === "in") {
    return [
      { code: "1010", debit: amount, credit: 0n },
      { code: IN_ACCOUNT[category] ?? "4900", debit: 0n, credit: amount },
    ];
  }
  return [
    { code: OUT_ACCOUNT[category] ?? "5900", debit: amount, credit: 0n },
    { code: "1010", debit: 0n, credit: amount },
  ];
}

/** Only entries that count are posted: money in when recorded, payments once approved. */
export const counts = (status: string) => status === "recorded" || status === "approved";
