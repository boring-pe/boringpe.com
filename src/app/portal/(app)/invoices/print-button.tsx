"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">
      Print or save as PDF
    </button>
  );
}
