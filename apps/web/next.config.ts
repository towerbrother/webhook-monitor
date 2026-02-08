import type { NextConfig } from "next";
import { validateEnv } from "./src/env";

// Validate environment variables at build time
validateEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@webhook-monitor/shared"],
};

export default nextConfig;
