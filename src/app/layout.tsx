import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://boringpe.com"),
  title: "Boring PE",
  description:
    "Boring PE builds, co-builds, and owns sustainable, cash-flowing businesses. Powering the Business Stack.",
  // Asks crawlers not to use the pages or images to train AI; search indexing is unaffected.
  other: { robots: "noai, noimageai", copyright: `© ${new Date().getFullYear()} Boring PE Venture. All rights reserved.` },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Serif:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
