import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sokaigelek.hu",
        pathname: "/wp-content/uploads/**",
      },
      {
        protocol: "https",
        hostname: "www.sokaigelek.hu",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
};

export default nextConfig;
