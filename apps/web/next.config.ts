import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // 允许从 workspace 包导入
  transpilePackages: ["@workbench/core"],
  serverExternalPackages: ["pg", "sharp"],
};

export default nextConfig;
