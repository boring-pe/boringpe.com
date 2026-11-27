import { ChevronDown, KeyRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ENTER = "auth-enter";

/**
 * The page around every sign-in step: a slow wash of the accent colour behind a single card, the
 * name, and help underneath. One card, one thing to do. Uses the portal's own tokens, so it
 * follows the device's light or dark setting. Motion is CSS only and stops for reduced motion.
 */
export function SignInShell({ children, contactEmail = "hello@boringpe.com" }: { children: React.ReactNode; contactEmail?: string }) {
  return (
    <div className="portal auth-root relative min-h-screen overflow-x-hidden text-slate-300" style={{ background: "var(--p-bg)" }}>
      <div className="auth-aurora" aria-hidden>
        <span className="auth-blob auth-blob-a" />
        <span className="auth-blob auth-blob-b" />
        <span className="auth-blob auth-blob-c" />
      </div>
      <main className="relative mx-auto flex min-h-screen w-full min-w-0 max-w-md flex-col justify-center px-4 py-10 sm:py-16">
        <header className={`text-center ${ENTER}`}>
          <span aria-hidden className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-600 font-serif text-xl font-semibold text-white shadow-sm">∑</span>
          <h1 className="text-4xl tracking-tight sm:text-5xl">
            Boring <span className="auth-word">portal</span>
          </h1>
          <p className="mt-2 text-base text-slate-400">One sign-in for Boring PE, Impact Marrow and Rahul Mane&apos;s desk</p>
        </header>

        <div className={`mt-8 ${ENTER}`} style={{ animationDelay: "100ms" }}>{children}</div>

        <details className={`group mt-5 ${ENTER}`} style={{ animationDelay: "200ms" }} data-access-help>
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-1.5 text-sm text-slate-400 [&::-webkit-details-marker]:hidden">
            New here? <span className="font-medium text-blue-400 underline-offset-4 hover:underline">Access is by invitation</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 grid gap-2 text-left text-sm sm:grid-cols-3">
            {[
              { title: "Team", text: "Partners, admins and operators, invited by the Super Admin." },
              { title: "Investors", text: "LPs see their holdings and the documents shared with them." },
              { title: "Partners", text: "Co-Build partners see the ventures linked to them." },
            ].map((x) => (
              <div key={x.title} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="font-semibold text-white">{x.title}</p>
                <p className="mt-1 text-xs leading-snug text-slate-400">{x.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">Ask whoever works with you at Boring PE for an invitation.</p>
        </details>

        <p className="mt-3 text-center text-xs text-slate-500">
          Trouble signing in? <a href={`mailto:${contactEmail}`} className="font-medium text-blue-400 underline-offset-4 hover:underline">Write to {contactEmail}</a>
        </p>
      </main>
    </div>
  );
}

/**
 * The card's heading: what this is, which of the two steps you are on, and a two-part bar for it.
 * Step 1 is who you are (password, a link, Google or LinkedIn); step 2 confirms it (two-step code)
 * or opens the portal.
 */
export function SignInCard({ step, stepText, title = "Sign in", icon: Icon = KeyRound, children }: { step: 1 | 2; stepText: string; title?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section aria-labelledby="signin-title" className="auth-ring rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left shadow-xl sm:p-7" data-signin-step={step}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="signin-title" className="!text-base !font-semibold !tracking-normal leading-tight text-white" style={{ fontFamily: "inherit" }}>{title}</h2>
          <p className="text-sm text-slate-400" aria-live="polite">{stepText}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1.5" aria-hidden>
        <span className="h-1 overflow-hidden rounded-full bg-slate-800">
          <span className="block h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: step === 1 ? "50%" : "100%" }} />
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-slate-800">
          <span className="block h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: step === 2 ? "100%" : "0%" }} />
        </span>
      </div>
      {children}
    </section>
  );
}

/** A notice inside the card: red for something wrong, accent for information. */
export function SignInNotice({ tone, children }: { tone: "bad" | "info"; children: React.ReactNode }) {
  return (
    <p role={tone === "bad" ? "alert" : "status"} data-persist className={`mt-5 rounded-lg border px-3 py-2 text-sm ${tone === "bad" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
      {children}
    </p>
  );
}
