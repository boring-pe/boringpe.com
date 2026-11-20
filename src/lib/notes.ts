import { getSql } from "./db";

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updated_at: Date;
};

export async function listNotes(ownerId: string) {
  const sql = await getSql();
  return sql.query<NoteRow>(
    `select id, title, body, pinned, updated_at from personal_notes
     where owner_id = $1 order by pinned desc, updated_at desc limit 200`,
    [ownerId],
  );
}

export async function addNote(ownerId: string, title: string, body: string) {
  const sql = await getSql();
  await sql.query(
    "insert into personal_notes (owner_id, title, body) values ($1, $2, $3)",
    [ownerId, title, body],
  );
}

export async function togglePin(ownerId: string, id: string) {
  const sql = await getSql();
  await sql.query(
    "update personal_notes set pinned = not pinned, updated_at = now() where id = $1 and owner_id = $2",
    [id, ownerId],
  );
}

export async function deleteNote(ownerId: string, id: string) {
  const sql = await getSql();
  await sql.query("delete from personal_notes where id = $1 and owner_id = $2", [id, ownerId]);
}
