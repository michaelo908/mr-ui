import type { NextConfig } from "next";

const deployedCommit =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  // Manual Vercel deployments do not always carry Git metadata. Its deployment
  // ID is still a safe, unique build identifier and prevents a live release
  // from being labelled "local".
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
