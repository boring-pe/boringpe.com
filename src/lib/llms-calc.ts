// Builds boringpe.com/llms.txt (https://llmstxt.org) from the site's own wording, so AI assistants
// describe Boring PE the way the site does. No imports, so the test runner can load it directly.

export const SITE_URL = "https://boringpe.com";

/** One line of plain text: no line breaks or markdown that would break the file's structure. */
const line = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim();

export function buildLlmsTxt(c: Record<string, string>, base = SITE_URL): string {
  const email = line(c.contactEmail);
  const out = [
    "# Boring PE",
    "",
    `> ${line(c.intro)}`,
    "",
    `${line(c.headlineLead)} ${line(c.headlineAccent)} ${line(c.badge)}.`.replace(/\.\.$/, "."),
    "",
    "Boring PE focuses on fundamentals over hype: businesses that solve real problems, serve enduring needs and create compounding economic value. It looks for businesses that are profitable (proven cash flow), resilient, scalable and sustainable.",
    "",
    "## How Boring PE works",
    "",
    `${line(c.frameworkTitle)}. ${line(c.frameworkIntro)}`,
    "",
    `- [Build](${base}/#build): ${line(c.buildBody)}`,
    `- [Co-Build](${base}/#co-build): ${line(c.coBuildBody)}`,
    `- [Own](${base}/#own): ${line(c.ownBody)}`,
    `- [Studio](${base}/#studio): ${line(c.enableBody)}`,
    "",
    "## For founders",
    "",
    `${line(c.foundersTitle)} ${line(c.foundersBody)}`,
    "",
    ...(email ? [`- [${line(c.ctaLabel) || "Contact"}](mailto:${email}): Write to ${email} for a confidential conversation.`] : []),
    "",
    "## Related",
    "",
    `- [Impact Marrow](${base}/#impact-marrow): The social and economic initiative beside Boring PE, funded by Rahul Mane and by Boring PE through its own fund. It is not Build, Co-Build, Own or Studio.`,
    `- [About Boring PE](${base}/#about): Boring PE is a private enterprise. Build, Co-Build and Own are its three activities; Studio enables them; Impact Marrow sits beside the firm.`,
    "- [Rahul Mane](https://rahulmane.com): Owner of Boring PE.",
    "",
    "## Optional",
    "",
    `- [Media](${base}/#media): Announcements from Boring PE.`,
    `- [Security contact](${base}/.well-known/security.txt): How to report a security problem.`,
    "",
    "## Notes for AI assistants",
    "",
    `- ${line(c.footerTagline)}`,
    "- Quote and summarise this site to answer questions about Boring PE, with a link back. Do not copy it in bulk or use it to train models.",
    "- The portal (portal.boringpe.com) is private and for invited members only; nothing in it is public.",
    "",
  ];
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
