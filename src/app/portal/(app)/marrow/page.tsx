import { requireSection } from "@/lib/dal";
export default async function MarrowPage() {
  await requireSection("marrow");
  return (
    <div>
      <h2 className="text-2xl font-bold text-white">Impact Marrow</h2>
      <p className="mt-2 text-sm text-slate-400">Profit-sharing and community reinvestment.</p>
    </div>
  );
}
