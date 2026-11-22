import { cookies } from "next/headers";
import QRCode from "qrcode";
import { KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { listDevices, pendingSecret, recoveryLeft, requiredRoles, twoFactorOn } from "@/lib/mfa";
import { otpauthUrl } from "@/lib/totp";
import type { UserRow } from "@/lib/users";
import { confirmTwoFactor, forgetTrustedDevice, freshRecoveryCodes, startTwoFactor, turnOffTwoFactor } from "./actions";

const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const ghost = "rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white";
const codeInput = "w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono tracking-[0.2em] text-white";

const NOTE: Record<string, { text: string; bad?: boolean }> = {
  on: { text: "Two-step sign-in is on. Keep the recovery codes below somewhere safe." },
  off: { text: "Two-step sign-in is off." },
  wrong: { text: "That code did not match. Check the time on your phone and try again.", bad: true },
  required: { text: "Your role requires two-step sign-in, so it cannot be turned off.", bad: true },
  forgot: { text: "That browser will be asked for a code next time." },
  codes: { text: "New recovery codes made; the old ones no longer work." },
};

export async function TwoStep({ user, enroll, tf }: { user: UserRow; enroll: boolean; tf?: string }) {
  const [on, required, pending, devices, left] = await Promise.all([
    twoFactorOn(user.id), requiredRoles(), pendingSecret(user.id), listDevices(user.id), recoveryLeft(user.id),
  ]);
  const mustSetUp = !on && required.includes(user.role);
  const shownCodes = (await cookies()).get("bp_codes")?.value?.split(",").filter(Boolean) ?? [];
  const note = tf ? NOTE[tf] : undefined;
  const qr = pending ? await QRCode.toString(otpauthUrl(pending, user.email), { type: "svg", margin: 1, width: 180 }) : null;

  return (
    <section id="two-step" className="rounded-xl border border-slate-800 bg-slate-900 p-6" data-two-step={on ? "on" : "off"}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-slate-500" />Two-step sign-in</h3>
      <p className="mt-1 text-xs text-slate-500">After your password, Google or email link, a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others).</p>
      {mustSetUp ? <p role="status" data-persist className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Your role requires two-step sign-in. Set it up to open the rest of the portal.</p> : null}
      {note ? <p role="status" className={`mt-3 rounded-md border px-3 py-2 text-sm ${note.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{note.text}</p> : null}

      {shownCodes.length ? (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4" data-recovery-codes>
          <div className="text-sm font-medium text-white">Recovery codes</div>
          <p className="mt-1 text-xs text-slate-400">Each works once if you lose your phone. They are shown only now.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-white sm:grid-cols-5">{shownCodes.map((c) => <span key={c} className="select-all">{c}</span>)}</div>
        </div>
      ) : null}

      {on ? (
        <div className="mt-4 space-y-4">
          <p className="flex items-center gap-2 text-sm text-green-400"><ShieldCheck className="h-4 w-4" />On · {left} recovery codes left</p>
          <div className="flex flex-wrap gap-3">
            <form action={freshRecoveryCodes}><button className={ghost}>Make new recovery codes</button></form>
            {!required.includes(user.role) ? (
              <form action={turnOffTwoFactor} className="flex items-center gap-2">
                <input name="code" required placeholder="Code" aria-label="Current code" className={`${codeInput} w-28 py-1.5 text-xs`} />
                <button className={ghost}>Turn off</button>
              </form>
            ) : null}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><MonitorSmartphone className="h-3.5 w-3.5" />Trusted browsers</div>
            {devices.length === 0 ? <p className="mt-2 text-sm text-slate-500">None. Tick “Trust this browser” when you enter a code.</p> : (
              <ul className="mt-2 divide-y divide-slate-800">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-300">{d.label || "Browser"} <span className="text-xs text-slate-500">· last used {d.last_used_at.slice(0, 10)} · until {d.expires_at.slice(0, 10)}</span></span>
                    <form action={forgetTrustedDevice}><input type="hidden" name="id" value={d.id} /><button className={ghost}>Forget</button></form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : pending && (enroll || mustSetUp || tf === "wrong") ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="rounded-lg bg-white p-2 [&_svg]:h-[180px] [&_svg]:w-[180px]" dangerouslySetInnerHTML={{ __html: qr! }} aria-label="QR code for your authenticator app" />
          <div className="space-y-3 text-sm text-slate-300">
            <p>1. Scan the code with your authenticator app, or type this key:</p>
            <code className="block select-all break-all rounded bg-slate-950 px-2 py-1.5 font-mono text-xs text-white" data-totp-secret>{pending}</code>
            <p>2. Enter the 6-digit code it shows.</p>
            <form action={confirmTwoFactor} className="flex items-center gap-2">
              <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" aria-label="Code from the app" className={codeInput} />
              <button className={btn}>Turn on</button>
            </form>
          </div>
        </div>
      ) : (
        <form action={startTwoFactor} className="mt-4"><button className={btn}>Set up two-step sign-in</button></form>
      )}
    </section>
  );
}
