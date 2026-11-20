import type { Adapter, AdapterUser } from "next-auth/adapters";
import { getSql } from "./db";
import { getUserByEmail, getUserById, type UserRow } from "./users";

function adapterUser(row: UserRow | null): AdapterUser | null {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    image: row.image,
  };
}

/**
 * Invite-only adapter. It can read users, link a provider identity to an existing user
 * and hold magic-link tokens. It cannot create users or change roles: only an admin does that.
 */
export function inviteOnlyAdapter(): Adapter {
  return {
    async createUser() {
      throw new Error("Sign-up is closed. Access is by invitation.");
    },
    async getUser(id) {
      return adapterUser(await getUserById(id));
    },
    async getUserByEmail(email) {
      return adapterUser(await getUserByEmail(email));
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const sql = await getSql();
      const rows = await sql.query<{ user_id: string }>(
        "select user_id from accounts where provider = $1 and provider_account_id = $2",
        [provider, providerAccountId],
      );
      const id = rows[0]?.user_id;
      return id ? adapterUser(await getUserById(id)) : null;
    },
    async updateUser(user) {
      const sql = await getSql();
      // Only profile fields. Role, status and password are never reachable from here.
      await sql.query(
        `update users set
           email_verified = coalesce($2, email_verified),
           name = coalesce(name, $3),
           image = coalesce($4, image)
         where id = $1`,
        [user.id, user.emailVerified ?? null, user.name ?? null, user.image ?? null],
      );
      const row = await getUserById(user.id as string);
      if (!row) throw new Error("User not found");
      return adapterUser(row) as AdapterUser;
    },
    async linkAccount(account) {
      const sql = await getSql();
      // Provider access and refresh tokens are deliberately dropped.
      await sql.query(
        `insert into accounts (user_id, type, provider, provider_account_id)
         values ($1, $2, $3, $4)
         on conflict (provider, provider_account_id) do nothing`,
        [account.userId, account.type, account.provider, account.providerAccountId],
      );
      return undefined;
    },
    async createVerificationToken(token) {
      const sql = await getSql();
      await sql.query(
        "insert into verification_token (identifier, token, expires) values ($1, $2, $3)",
        [token.identifier, token.token, token.expires],
      );
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      const sql = await getSql();
      const rows = await sql.query<{ identifier: string; token: string; expires: Date }>(
        `delete from verification_token where identifier = $1 and token = $2
         returning identifier, token, expires`,
        [identifier, token],
      );
      return rows[0] ?? null;
    },
  };
}
