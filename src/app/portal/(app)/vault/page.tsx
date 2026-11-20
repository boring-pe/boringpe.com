import { requireSection } from "@/lib/dal";
export default async function VaultPage() {
  await requireSection("vault");
  return (
    <div>
      <h2 className="text-2xl font-bold text-white">BIDU Vault</h2>
      <p className="mt-2 text-sm text-slate-400">Institutional playbooks and documents.</p>
    </div>
  );
}
