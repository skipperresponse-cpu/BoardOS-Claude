import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use only tsx/jsx/js extensions so root-level middleware.ts and proxy.ts
  // are not detected as Next.js middleware/proxy files (both exist and cannot be deleted).
  // Auth is enforced at layout level. All pages/layouts/routes use .tsx or .jsx.
  pageExtensions: ['tsx', 'jsx', 'js'],
};

export default nextConfig;
