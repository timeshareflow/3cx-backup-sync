import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },
  // Exclude native packages from bundling (used in API routes)
  serverExternalPackages: ["ssh2", "pg", "pg-native"],
};

export default nextConfig;
