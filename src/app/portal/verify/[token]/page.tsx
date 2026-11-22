import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { linkByToken } from "@/lib/kyc";

export const metadata: Metadata = { title: "Verify with Boring PE", robots: { index: false, follow: false } };

const FINISHED: Record<string, { title: string; text: string }> = {
  ok: { title: "Thank you", text: "Your documents were shared with Boring PE. You can close this page." },
  invalid: { title: "This link no longer works", text: "It was already used or has expired. Ask Boring PE for a new one." },
  failed: { title: "Something went wrong", text: "The locker did not answer. Please try the link again, or ask Boring PE for a new one." },
  cancelled: { title: "Nothing was shared", text: "You left before giving consent. You can open the link again while it is valid." },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f3ea] px-4 py-16 text-[#1a1f2b]">
      <div className="mx-auto max-w-lg rounded-2xl border border-[#e4dfd2] bg-white p-8 shadow-sm">{children}</div>
      <p className="mx-auto mt-6 max-w-lg text-center text-xs text-[#6b7280]">Boring PE · know-your-customer verification</p>
    </main>
  );
}

/** The page a person or entity opens from their KYC link. No sign-in to the portal is needed. */
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string; e?: string }> }) {
  const { token } = await params;
  const { r, e } = await searchParams;
  if (token === "finished") {
    const f = FINISHED[r ?? ""] ?? FINISHED.invalid;
    return <Shell><h1 className="font-serif text-2xl font-semibold" data-verify-result={r}>{f.title}</h1><p className="mt-3 text-sm text-[#4b5563]">{f.text}</p></Shell>;
  }
  const link = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await linkByToken(token) : null;
  if (!link || link.used || link.expired) return <Shell><h1 className="font-serif text-2xl font-semibold">{FINISHED.invalid.title}</h1><p className="mt-3 text-sm text-[#4b5563]">{FINISHED.invalid.text}</p></Shell>;
  const locker = link.locker === "digilocker" ? "DigiLocker" : "Entity Locker";
  return (
    <Shell>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1f5f41]"><ShieldCheck className="h-4 w-4" />Verification request</div>
      <h1 className="mt-2 font-serif text-2xl font-semibold">Verify {link.subject_name}</h1>
      <p className="mt-3 text-sm text-[#4b5563]">
        Boring PE asks you to share documents from your {locker} to complete know-your-customer checks. You sign in on the
        government {locker} site; Boring PE never sees your password.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[#4b5563]">
        {link.subject_type === "person" ? (
          <><li>Your name, date of birth and gender as on Aadhaar</li><li>Your Aadhaar number with only the last four digits kept</li><li>The list of documents issued to you, such as your PAN</li></>
        ) : (
          <><li>The entity&apos;s registered name</li><li>The list of documents issued to it, such as incorporation and GST certificates</li></>
        )}
      </ul>
      <form action="/api/kyc/start" method="post" className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consent" value="yes" required className="mt-1" />
          <span>I agree to share these details with Boring PE for KYC verification.</span>
        </label>
        {e === "consent" ? <p className="text-sm text-red-700">Please tick the box to agree first.</p> : null}
        <button className="w-full rounded-lg bg-[#1f5f41] px-4 py-3 text-sm font-semibold text-white hover:bg-[#184b33]">Continue to {locker}</button>
      </form>
      <p className="mt-4 text-xs text-[#6b7280]">This link works once and expires seven days after it was sent.</p>
    </Shell>
  );
}
