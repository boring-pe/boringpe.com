/** The first sentence of a piece of site text, for link previews. */
export const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

/** The other pages to suggest from a page, by href, with a preview line from the site's own text. */
export function seeAlso(c: Record<string, string>, except: string) {
  return [
    { href: "/build", label: "Build", note: firstSentence(c.buildBody) },
    { href: "/co-build", label: "Co-Build", note: firstSentence(c.coBuildBody) },
    { href: "/own", label: "Own", note: firstSentence(c.ownBody) },
    { href: "/studio", label: "Studio", note: firstSentence(c.enableBody) },
    { href: "/impact-marrow", label: "Impact Marrow", note: firstSentence(c.impactBody) },
    { href: "/about", label: "About Us", note: firstSentence(c.aboutBody) },
  ].filter((x) => x.href !== except).slice(0, 3);
}
