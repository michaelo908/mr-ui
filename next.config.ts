import type { NextConfig } from "next";

const deployedCommit =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  // Manual Vercel deployments do not always carry Git metadata or the
  // deployment ID while Next is building. The deployment URL is available at
  // that point and remains a safe, unique build identifier.
  process.env.VERCEL_URL ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  "local";

const nextConfig: NextConfig = {
  // Keep pdf-parse and its worker intact in the Vercel function bundle.
  serverExternalPackages: ["pdf-parse"],
  env: {
    // Safe to expose: it identifies the deployed code, not a credential.
    NEXT_PUBLIC_MULTIRRUPT_BUILD: deployedCommit.slice(0, 7),
  },
};

export default nextConfig;
