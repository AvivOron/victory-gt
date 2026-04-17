import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/victory-gt",
  allowedDevOrigins: ["192.168.1.203", "campfire-sphere-unsubtly.ngrok-free.dev"],
  async headers() {
    return [
      {
        source: "/products/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/victory-gt",
        permanent: false,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
