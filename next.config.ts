import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/apps/reverse-ring",
  trailingSlash: true,
};

export default nextConfig;
