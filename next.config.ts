import type { NextConfig } from "next";

const PAGES_BASE_PATH = "/UXUV-Pages/0.1.1";

const nextConfig: NextConfig = {
  basePath: PAGES_BASE_PATH,
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
