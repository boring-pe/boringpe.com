import { VERTICALS } from "@/lib/ops-fields";

/** Which vertical a record belongs to. "Automatic" takes it from the entity (Boring Stack for Boring PE itself). */
export function VerticalSelect({ className, defaultValue = "" }: { className: string; defaultValue?: string }) {
  return (
    <select name="vertical" defaultValue={defaultValue} className={className} aria-label="Vertical">
      <option value="">Vertical: automatic</option>
      {VERTICALS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  );
}
