import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // 允许从 workspace 包导入
  transpilePackages: ["@workbench/core"],
};

export default nextConfig;
