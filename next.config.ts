import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/victory-gt",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "1xwed3vbdtn2bscw.public.blob.vercel-storage.com", pathname: "/products/**" },
    ],
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
