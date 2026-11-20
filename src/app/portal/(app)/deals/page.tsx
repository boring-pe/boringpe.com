import { requireSection } from "@/lib/dal";
export default async function DealsPage() {
  await requireSection("deals");
  return (
    <div>
      <h2 className="text-2xl font-bold text-white">Deal Pipeline</h2>
      <p className="mt-2 text-sm text-slate-400">Active build and co-build opportunities.</p>
    </div>
  );
}
