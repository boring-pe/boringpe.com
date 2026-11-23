import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_HEADERS, PORTAL_HEADERS, securityHeaders } from "./src/lib/security-calc";

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Embedded Postgres is only used in local development and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Vault uploads are up to 4 MB; Vercel functions accept request bodies up to 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(dev) },
      { source: "/:path*.(svg|png|jpg|jpeg|gif|webp|avif|ico|pdf|woff|woff2)", headers: ASSET_HEADERS },
      { source: "/_next/image", headers: ASSET_HEADERS },
      { source: "/portal/:path*", headers: PORTAL_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
