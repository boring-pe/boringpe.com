"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUp } from "lucide-react";

function Send() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Send"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-60"
    >
      {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowUp className="h-5 w-5" />}
    </button>
  );
}

function Thinking({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return pending ? <p className="px-1 pb-2 text-xs text-slate-500" role="status" data-persist>{name} is working on it…</p> : null;
}

/** The message box: Enter sends, Shift+Enter adds a line. */
export function Composer({
  action, threadId, name, providers, current, suggestions,
}: {
  action: (f: FormData) => Promise<void>;
  threadId: string | null;
  name: string;
  providers: { id: string; label: string }[];
  current: string;
  suggestions: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <form ref={form} action={action} className="space-y-2" data-composer>
      <Thinking name={name} />
      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { if (box.current) { box.current.value = s; box.current.focus(); } }}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-blue-500 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
      <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-950 p-2 focus-within:border-blue-500">
        <textarea
          ref={box}
          name="text"
          required
          rows={2}
          maxLength={20000}
          placeholder={`Ask ${name} anything, or tell her what to do…`}
          aria-label={`Message ${name}`}
          autoFocus
          className="max-h-60 min-h-10 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
        />
        <Send />
      </div>
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <label className="flex items-center gap-2">
          AI
          <select name="provider" defaultValue={current} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300" aria-label="AI service">
            <option value="auto">Automatic (first that answers)</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <span>Enter to send · Shift+Enter for a new line</span>
      </div>
    </form>
  );
}
