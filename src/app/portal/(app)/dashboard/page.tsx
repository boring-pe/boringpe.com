import { BarChart3 } from "lucide-react";
import { requireSection } from "@/lib/dal";

export default async function DashboardPage() {
  await requireSection("dashboard");
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Figures on this page come only from records kept in the portal.
        </p>
      </div>
      <div className="p-10 bg-slate-900 border border-dashed border-slate-700 rounded-xl text-center">
        <BarChart3 className="w-8 h-8 mx-auto text-slate-600" />
        <h3 className="mt-4 text-base font-semibold text-white">Nothing to report yet</h3>
        <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
          Revenue, fees, SPVs and the pipeline will appear here once deals, companies and money are
          recorded in Operations. Until then there are no numbers to show.
        </p>
      </div>
    </div>
  );
}
