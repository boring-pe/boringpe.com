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
  {
    id: "ai_anthropic", name: "Anthropic Claude", group: "AI assistant",
    summary: "Powers the assistant with Claude.",
    fields: [
      { key: "apiKey", label: "API key", secret: true, required: true, placeholder: "sk-ant-…" },
      { key: "model", label: "Model", required: true, placeholder: "claude-sonnet-5-5" },
    ],
    setup: "console.anthropic.com → API keys → Create key. Model names are listed under Models.",
  },
  {
    id: "ai_openai", name: "OpenAI", group: "AI assistant",
    summary: "Powers the assistant with an OpenAI model.",
    fields: [
      { key: "apiKey", label: "API key", secret: true, required: true, placeholder: "sk-…" },
      { key: "model", label: "Model", required: true, placeholder: "the model name from your OpenAI account" },
    ],
    setup: "platform.openai.com → API keys → Create new secret key.",
  },
  {
    id: "ai_gemini", name: "Google Gemini", group: "AI assistant",
    summary: "Powers the assistant with a Gemini model.",
    fields: [
      { key: "apiKey", label: "API key", secret: true, required: true },
      { key: "model", label: "Model", required: true, placeholder: "the Gemini model name" },
    ],
    setup: "aistudio.google.com → Get API key.",
  },
  {
    id: "ai_custom", name: "Your own or another AI", group: "AI assistant",
    summary: "Any OpenAI-compatible service: a model you host yourself (Ollama, vLLM), OpenRouter, Groq and others.",
    fields: [
      { key: "baseUrl", label: "Base URL", required: true, placeholder: "https://ai.yourdomain.in/v1" },
      { key: "apiKey", label: "API key", secret: true, placeholder: "leave empty if your server needs none" },
      { key: "model", label: "Model", required: true },
    ],
    setup: "The address must end where /chat/completions is served, for example …/v1. The model must support tool calls.",
  },
  {
    id: "digilocker", name: "DigiLocker (direct)", group: "KYC",
    summary: "People share PAN, Aadhaar (masked) and other issued documents from their own DigiLocker, with consent.",
    fields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
      { key: "baseUrl", label: "API host", placeholder: "https://api.digitallocker.gov.in" },
    ],
    setup: "Needs approval as a DigiLocker requester (partners.digitallocker.gov.in / API Setu). Register the callback URL shown here.",
  },
  {
    id: "entity_locker", name: "Entity Locker (direct)", group: "KYC",
    summary: "Companies, LLPs and firms share their registration and tax documents from Entity Locker, with consent.",
    fields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
      { key: "baseUrl", label: "API host", placeholder: "https://entity.digilocker.gov.in" },
    ],
    setup: "Needs approval as an Entity Locker requester (entity.digilocker.gov.in). Register the callback URL shown here.",
  },
  {
    id: "kyc_provider", name: "KYC provider", group: "KYC",
    summary: "A licensed verification service (Setu, Signzy, IDfy, Surepass and others) for PAN, GSTIN, CIN and bank checks until direct access is approved.",
    fields: [
      { key: "name", label: "Provider name", required: true, placeholder: "e.g. Surepass" },
      { key: "baseUrl", label: "Base URL", required: true, placeholder: "https://…" },
      { key: "apiKey", label: "API key or token", secret: true, required: true },
      { key: "authHeader", label: "Key header", placeholder: "Authorization (sent as Bearer) or e.g. x-api-key" },
      { key: "panPath", label: "PAN check path", placeholder: "/pan/verify" },
      { key: "gstinPath", label: "GSTIN check path", placeholder: "/gstin/verify" },
      { key: "cinPath", label: "CIN check path", placeholder: "/company/details" },
      { key: "bankPath", label: "Bank account check path", placeholder: "/bank/verify" },
    ],
    setup: "Each path receives a JSON POST like {\"id_number\": \"…\"} (bank: account_number and ifsc). The answer is shown to the reviewer, who confirms the check.",
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
