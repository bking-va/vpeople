import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  serverExternalPackages: ["unpdf", "pdfjs-dist", "fflate"],
  outputFileTracingIncludes: {
    "/api/admin/seed": ["./drizzle/**/*"],
    "/api/hiring/match": ["./data/geocode/**/*"],
    "/api/hiring/openings/[id]/match": ["./data/geocode/**/*"],
    "/api/settings/customer-locations": ["./data/geocode/**/*"],
  },
};

export default nextConfig;
