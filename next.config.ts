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
  // Single-company deployment: the public marketing site and self-service signup were
  // removed. Send any old links or bookmarks to the login page instead of a 404.
  // Users are added only through the admin invite flow (/api/admin/users/invite).
  async redirects() {
    return [
      { source: "/welcome", destination: "/login", permanent: false },
      { source: "/pricing", destination: "/login", permanent: false },
      { source: "/signup", destination: "/login", permanent: false },
    ];
  },
};

export default nextConfig;
