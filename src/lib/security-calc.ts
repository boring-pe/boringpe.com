// Pure security rules: response headers, crawler policy, client addresses and rate-limit windows.
// No imports, so next.config, the proxy and the test runner can all load it.

/** The Content-Security-Policy for every page. Development needs eval for fast refresh. */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Sign-in with Google or LinkedIn posts to /api/auth and is then redirected to the provider.
    "form-action 'self' https:",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export type Header = { key: string; value: string };

/** Headers for every response on every host. */
export function securityHeaders(dev = false): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}

/** Extra headers for images and files: other sites cannot embed (hotlink) them. */
export const ASSET_HEADERS: Header[] = [{ key: "Cross-Origin-Resource-Policy", value: "same-site" }];

/** Extra headers for the portal: never indexed, never cached, never sent with a referrer. */
export const PORTAL_HEADERS: Header[] = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/**
 * Crawlers that collect pages to train AI models or to resell copies. Search engines and the
 * assistants' live search fetchers (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User,
 * Claude-User, PerplexityBot) are not on the list, so the site can still be found.
 */
export const TRAINING_CRAWLERS = [
  "GPTBot", "ClaudeBot", "anthropic-ai", "Claude-Web", "CCBot", "Google-Extended", "Applebot-Extended",
  "Bytespider", "meta-externalagent", "Meta-ExternalFetcher", "FacebookBot", "Diffbot", "Omgilibot", "omgili",
  "ImagesiftBot", "cohere-ai", "cohere-training-data-crawler", "AI2Bot", "Ai2Bot-Dolma",
  "Timpibot", "VelenPublicWebCrawler", "Webzio-Extended", "Amazonbot", "img2dataset",
  "Scrapy", "HTTrack", "WebCopier", "Offline Explorer", "SiteSnagger", "TeleportPro", "WebZIP", "wget",
];

const CRAWLER_RE = new RegExp(TRAINING_CRAWLERS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

/** Whether a user agent is a training crawler or a site copier. */
export const isTrainingCrawler = (ua: string | null | undefined) => !!ua && CRAWLER_RE.test(ua);

/** The caller's address from the proxy headers, or "unknown". */
export function clientIp(get: (name: string) => string | null): string {
  const forwarded = get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}

/** The start of the fixed window `now` falls in. */
export function windowStart(now: number, windowSeconds: number): number {
  const ms = windowSeconds * 1000;
  return Math.floor(now / ms) * ms;
}

/** Seconds until the window ends, for Retry-After. */
export function retryAfter(now: number, windowSeconds: number): number {
  return Math.max(1, Math.ceil((windowStart(now, windowSeconds) + windowSeconds * 1000 - now) / 1000));
}

/** The limits, as hits per window. */
export const LIMITS = {
  /** Wrong passwords from one address, across all accounts. Each account also locks on its own. */
  signInFailIp: { limit: 30, window: 15 * 60 },
  /** Wrong passwords for one address book entry, from anywhere. */
  signInFailEmail: { limit: 10, window: 15 * 60 },
  /** Sign-in links asked for one email. */
  magicLink: { limit: 5, window: 60 * 60 },
  /** Calls with one API key. */
  apiKey: { limit: 120, window: 60 },
  /** Calls with a bad or missing API key from one address. */
  apiBadKey: { limit: 20, window: 60 },
  /** Webhook calls from one address. */
  webhook: { limit: 300, window: 60 },
  /** KYC consent journeys started from one address. */
  kycStart: { limit: 20, window: 60 * 60 },
  /** Exports (CSV, backups) by one person. */
  export: { limit: 30, window: 60 * 60 },
  /** File downloads by one person. */
  download: { limit: 300, window: 60 * 60 },
} as const;

export type Bucket = keyof typeof LIMITS;

/** Signs out after this long without activity in the portal. */
export const IDLE_MINUTES = 30;

/** The confidentiality line on every export. */
export const confidentialLine = (email: string, at: Date) =>
  `Confidential: exported by ${email} on ${at.toISOString().slice(0, 16).replace("T", " ")} UTC. Do not share outside Boring PE.`;
