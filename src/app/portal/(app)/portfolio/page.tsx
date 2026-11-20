import { requireSection } from "@/lib/dal";
export default async function PortfolioPage() {
  await requireSection("portfolio");
  return (
    <div>
      <h2 className="text-2xl font-bold text-white">Portfolio (SPVs)</h2>
      <p className="mt-2 text-sm text-slate-400">Owned and co-built companies.</p>
    </div>
  );
}
