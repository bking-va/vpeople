import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  outputFileTracingIncludes: {
    '/api/admin/seed': ['./drizzle/**/*'],
  },
};

export default nextConfig;
