import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import Resend from "next-auth/providers/resend";
import { superAdminEmails, looksLikeEmail, normalizeEmail } from "./lib/admin-emails";
import { inviteOnlyAdapter } from "./lib/auth-adapter";
import { burnPasswordCheck, verifyPassword } from "./lib/password";
import { providerFlags } from "./lib/providers";
import { exhausted, hit } from "./lib/rate-limit";
import { clientIp } from "./lib/security-calc";
import {
  createUser,
  getUserByEmail,
  getUserById,
  recordFailedLogin,
  recordSignIn,
} from "./lib/users";

/**
 * Decides whether an email may enter. Existing, active users may. A new address may only
 * if it is listed in SUPER_ADMIN_EMAILS, which provisions the Super Admin seat. Disabled wins.
 */
async function mayEnter(email: string) {
  if (!looksLikeEmail(email)) return false;
  const user = await getUserByEmail(email);
  if (user) return user.status === "active";
  if (superAdminEmails().includes(email)) {
    await createUser({ email, name: "Rahul Mane", role: "super_admin", createdBy: "bootstrap" });
    return true;
  }
  return false;
}

function verified(profile: unknown) {
  const value = (profile as { email_verified?: unknown } | null | undefined)?.email_verified;
  return value === true || value === "true";
}

async function sendMagicLink({ identifier, url }: { identifier: string; url: string }) {
  // Do not reveal who is invited: uninvited addresses get the same screen but no email.
  const user = await getUserByEmail(normalizeEmail(identifier));
  const allowed = user ? user.status === "active" : superAdminEmails().includes(normalizeEmail(identifier));
  if (!allowed) return;
  // At most a few links an hour to one inbox, so the form cannot be used to flood it.
  if (!(await hit("magicLink", normalizeEmail(identifier), "sign-in links")).ok) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: identifier,
      subject: "Your Boring PE portal sign-in link",
      text: `Sign in to the Boring PE portal:\n\n${url}\n\nThe link works once and expires soon. If you did not ask for it, ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error(`Sign-in email failed (${response.status})`);
}

function buildProviders(): Provider[] {
  const flags = providerFlags();
  const list: Provider[] = [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(input, request) {
        const email = normalizeEmail(input?.email);
        const password = typeof input?.password === "string" ? input.password : "";
        const ip = clientIp((name) => request?.headers?.get(name) ?? null);
        // Too many wrong passwords from this address, or for this email, in the window: refuse
        // without checking, so guessing stays slow even across many accounts or addresses.
        if ((await exhausted("signInFailIp", ip)) || (looksLikeEmail(email) && (await exhausted("signInFailEmail", email)))) {
          await burnPasswordCheck(password || "x");
          await hit("signInFailIp", ip, "sign-in");
          return null;
        }
        const failed = async () => {
          await hit("signInFailIp", ip, "sign-in from one address");
          if (looksLikeEmail(email)) await hit("signInFailEmail", email, "sign-in to one email");
        };
        if (!looksLikeEmail(email) || !password || password.length > 200) {
          await burnPasswordCheck(password || "x");
          await failed();
          return null;
        }
        const user = await getUserByEmail(email);
        if (!user || user.status !== "active" || !user.password_hash) {
          await burnPasswordCheck(password);
          await failed();
          return null;
        }
        if (user.locked_until && user.locked_until.getTime() > Date.now()) {
          await burnPasswordCheck(password);
          await failed();
          return null;
        }
        if (!(await verifyPassword(password, user.password_hash))) {
          await recordFailedLogin(user.id);
          await failed();
          return null;
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ];

  // Same-email linking is safe here only because the signIn callback below requires a
  // provider-verified email and an existing, active invited user.
  if (flags.google) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (flags.linkedin) {
    list.push(
      LinkedIn({
        clientId: process.env.AUTH_LINKEDIN_ID,
        clientSecret: process.env.AUTH_LINKEDIN_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (flags.email) {
    list.push(
      Resend({
        apiKey: process.env.AUTH_RESEND_KEY,
        from: process.env.AUTH_EMAIL_FROM,
        maxAge: 15 * 60,
        sendVerificationRequest: sendMagicLink,
      }),
    );
  }
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: inviteOnlyAdapter(),
  providers: buildProviders(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  trustHost: true,
  pages: {
    signIn: "/portal/login",
    error: "/portal/login",
    verifyRequest: "/portal/login?sent=1",
  },
  callbacks: {
    async signIn({ user, account, profile, email }) {
      if (account?.provider === "credentials") return true;
      if (account?.type === "email") {
        // First leg only sends the link; the second leg (clicking it) is the real gate.
        if (email?.verificationRequest) return true;
        return mayEnter(normalizeEmail(user.email));
      }
      if (!verified(profile)) return false;
      return mayEnter(normalizeEmail(user.email ?? (profile as { email?: string } | null)?.email));
    },
    async jwt({ token, user }) {
      if (user?.id) {
        const row = await getUserById(user.id);
        token.sub = user.id;
        token.epoch = row?.session_epoch ?? -1;
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.sub ?? "";
      session.epoch = typeof token.epoch === "number" ? token.epoch : -1;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user?.id) await recordSignIn(user.id);
    },
  },
});
