import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/victory-gt",
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
