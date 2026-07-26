import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  async redirects() {
    return [
      // Usage became a modal in the header; keep old links/bookmarks working
      // instead of 404ing.
      { source: "/usage", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
