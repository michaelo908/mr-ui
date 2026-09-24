import type { NextConfig } from "next";

const deployedCommit =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "local";

const nextConfig: NextConfig = {
  // Keep pdf-parse and its worker intact in the Vercel function bundle.
  serverExternalPackages: ["pdf-parse"],
  env: {
    // Safe to expose: it identifies the deployed code, not a credential.
    NEXT_PUBLIC_MULTIRRUPT_BUILD: deployedCommit.slice(0, 7),
  },
};

export default nextConfig;
