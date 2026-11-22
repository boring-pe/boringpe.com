"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

/** Shows a secret for 30 seconds after asking the server (which logs the look), with a copy button. */
export function Reveal({ id, action }: { id: string; action: (id: string) => Promise<{ secret: string; notes: string } | null> }) {
  const [value, setValue] = useState<{ secret: string; notes: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), 30_000);
    return () => clearTimeout(t);
  }, [value]);
  if (!value) {
    return (
      <button type="button" onClick={async () => setValue(await action(id))} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white" data-reveal={id}>
        <Eye className="h-3.5 w-3.5" />Show
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code className="select-all rounded bg-slate-950 px-2 py-1 font-mono text-xs text-white" data-secret-value>{value.secret}</code>
        <button type="button" aria-label="Copy" onClick={async () => { await navigator.clipboard.writeText(value.secret).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-slate-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Hide" onClick={() => setValue(null)} className="text-slate-400 hover:text-white"><EyeOff className="h-3.5 w-3.5" /></button>
        {copied ? <span className="text-xs text-green-400">Copied</span> : null}
      </div>
      {value.notes ? <p className="whitespace-pre-wrap text-xs text-slate-400">{value.notes}</p> : null}
    </div>
  );
}
