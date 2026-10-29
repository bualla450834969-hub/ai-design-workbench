import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  env: {
    NEXT_PUBLIC_WEB_LOCAL_MODE: "true",
  },
};

export default nextConfig;
