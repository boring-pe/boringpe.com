import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boring PE",
  description:
    "Boring PE is a private enterprise. The Unconventional Business Building Framework covers BUILD, CO-BUILD, OWN and ENABLE. Powering the Business Stack.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
