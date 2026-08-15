import type { NextConfig } from "next";

const PAGES_BASE_PATH = "/UXUV-Pages";

const nextConfig: NextConfig = {
  basePath: PAGES_BASE_PATH,
  allowedDevOrigins: ["127.0.0.1"],
  generateBuildId: async () => "uxuv-pages-0.2.1",
  output: "export",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
