// What each service needs. Pure, so the page and the tests share it.

export type Field = { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string };
export type Provider = { id: string; name: string; group: string; summary: string; fields: Field[]; setup: string };

export const PROVIDERS: Provider[] = [
  {
    id: "resend", name: "Resend (system email)", group: "Email",
    summary: "Sends sign-in links, invites and notifications.",
    fields: [
      { key: "apiKey", label: "API key", secret: true, required: true, placeholder: "re_…" },
      { key: "from", label: "From address", required: true, placeholder: "Boring PE <portal@boringpe.com>" },
    ],
    setup: "resend.com → API Keys → Create; verify boringpe.com under Domains first.",
  },
  {
    id: "google", name: "Google Workspace / Gmail", group: "Email and calendar",
    summary: "Lets each person connect their Gmail mailbox and calendar to the unified inbox.",
    fields: [
      { key: "clientId", label: "OAuth client ID", required: true, placeholder: "…apps.googleusercontent.com" },
      { key: "clientSecret", label: "OAuth client secret", secret: true, required: true },
    ],
    setup: "Google Cloud console → APIs & Services → enable Gmail API and Google Calendar API → Credentials → OAuth client (Web) with the redirect URL shown here.",
  },
  {
    id: "microsoft", name: "Microsoft 365 / Outlook", group: "Email and calendar",
    summary: "Lets each person connect their Outlook mailbox and calendar.",
    fields: [
      { key: "clientId", label: "Application (client) ID", required: true },
      { key: "clientSecret", label: "Client secret value", secret: true, required: true },
      { key: "tenant", label: "Tenant", placeholder: "common (any account) or your tenant ID" },
    ],
    setup: "Azure portal → App registrations → New → Web redirect URL shown here → Certificates & secrets → New client secret.",
  },
  {
    id: "zoho", name: "Zoho Mail", group: "Email and calendar",
    summary: "Lets each person connect their Zoho mailbox.",
    fields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
      { key: "domain", label: "Data centre", placeholder: "in (India), com, eu, com.au" },
    ],
    setup: "api-console.zoho.in → Add client → Server-based application → redirect URL shown here.",
  },
  {
    id: "whatsapp", name: "WhatsApp Business (Cloud API)", group: "Messaging",
    summary: "Send and receive WhatsApp messages in the portal's shared inbox.",
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", required: true },
      { key: "businessAccountId", label: "WhatsApp Business Account ID", required: true },
      { key: "accessToken", label: "Permanent access token", secret: true, required: true },
      { key: "appSecret", label: "App secret", secret: true, required: true },
      { key: "verifyToken", label: "Webhook verify token", secret: true, required: true, placeholder: "any long random text" },
    ],
    setup: "developers.facebook.com → your app → WhatsApp → API setup; System user token with whatsapp_business_messaging; webhook URL shown here, subscribe to messages.",
  },
  {
    id: "razorpay", name: "Razorpay", group: "Payments",
    summary: "Payment links on invoices; paid links post to the books.",
    fields: [
      { key: "keyId", label: "Key ID", required: true, placeholder: "rzp_live_…" },
      { key: "keySecret", label: "Key secret", secret: true, required: true },
      { key: "webhookSecret", label: "Webhook secret", secret: true, required: true },
    ],
    setup: "Razorpay dashboard → Account & Settings → API keys; Webhooks → add the URL shown here with payment_link.paid.",
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

export const API_SCOPES = [
  { id: "read", label: "Read entities, invoices, money and reports" },
  { id: "write:money", label: "Record money in" },
  { id: "write:tasks", label: "Create tasks" },
] as const;
export type ApiScope = (typeof API_SCOPES)[number]["id"];
export const isApiScope = (v: unknown): v is ApiScope => API_SCOPES.some((s) => s.id === v);

export const WEBHOOK_EVENTS = [
  "invoice.issued", "invoice.paid", "money.recorded", "approval.requested", "approval.decided", "task.created", "whatsapp.message",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Outgoing webhooks only go to public HTTPS addresses, never to this machine or a private network. */
export function safeWebhookUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return false;
  }
  return true;
}
