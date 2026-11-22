import { Lock, Pin } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { listNotes } from "@/lib/notes";
import { createNote, pinNote, removeNote } from "./actions";

const NOTICES: Record<string, string> = {
  added: "Note saved.",
  removed: "Note deleted.",
  invalid: "Give the note a title.",
};

const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const me = await requireSection("personal");
  const { notice } = await searchParams;
  const notes = await listNotes(me.id);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold tracking-wide uppercase">
          <Lock className="w-4 h-4" />
          Private to you
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Personal desk</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Private notes in your Personal workspace, next to your own books, investments, mail and tasks.
          No admin, partner or other seat can open anything in it.
        </p>
      </div>

      {notice && NOTICES[notice] ? (
        <p role="status" className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          {NOTICES[notice]}
        </p>
      ) : null}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">New note</h3>
        <form action={createNote} className="space-y-3">
          <input name="title" required maxLength={140} placeholder="Title" className={input} />
          <textarea name="body" maxLength={8000} rows={4} placeholder="Write here" className={input} />
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Save note
          </button>
        </form>
      </section>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    {note.pinned ? <Pin className="w-3.5 h-3.5 text-blue-400" /> : null}
                    {note.title}
                  </h4>
                  {note.body ? (
                    <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap break-words">{note.body}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-3 text-xs font-semibold">
                  <form action={pinNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <button type="submit" className="text-blue-400 hover:text-blue-300">
                      {note.pinned ? "Unpin" : "Pin"}
                    </button>
                  </form>
                  <form action={removeNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <button type="submit" className="text-slate-500 hover:text-red-400">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
