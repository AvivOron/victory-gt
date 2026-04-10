import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/prices",
        destination: "/victory-gt/prices",
        permanent: false,
      },
      {
        source: "/api/:path*",
        destination: "/victory-gt/api/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/victory-gt",
        destination: "/",
      },
      {
        source: "/victory-gt/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
