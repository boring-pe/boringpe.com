"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, TriangleAlert } from "lucide-react";

/**
 * A form's submit button that disables itself and says what is happening while the work
 * runs, so a second click cannot send the form twice.
 */
export function SubmitButton({
  children,
  pending: pendingLabel = "Saving…",
  className = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
  name,
  value,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * A destructive button that asks first. It opens a dialog saying exactly what will happen and
 * that it cannot be undone; only "confirm" submits the surrounding form (with this button's
 * name and value). Place it inside the form, like an ordinary submit button.
 */
export function ConfirmButton({
  children,
  title,
  body,
  confirm,
  name,
  value,
  className = "text-sm text-red-300 hover:text-red-200",
}: {
  children: React.ReactNode;
  title: string;
  body: string;
  confirm: string;
  name?: string;
  value?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  return (
    <>
      <button type="button" className={`${className} disabled:opacity-60`} disabled={pending} onClick={() => dialog.current?.showModal()} data-confirm-trigger>
        {pending ? "Working…" : children}
      </button>
      <button ref={submit} type="submit" name={name} value={value} hidden tabIndex={-1} aria-hidden />
      <dialog ref={dialog} className="confirm" aria-labelledby={`c-${title}`} data-confirm-dialog onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <TriangleAlert aria-hidden className="h-4 w-4" />
            </span>
            <div>
              <h2 id={`c-${title}`} className="text-base font-semibold text-white">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Keep it
            </button>
            <button
              type="button"
              data-confirm
              onClick={() => {
                dialog.current?.close();
                submit.current?.form?.requestSubmit(submit.current);
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              {confirm}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
