import type { NextConfig } from "next";

const apiUrl = process.env["API_URL"] ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
