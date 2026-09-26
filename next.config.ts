import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse and its worker intact in the Vercel function bundle.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
