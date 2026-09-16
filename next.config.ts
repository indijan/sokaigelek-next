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
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/cikkek/uj-cikk-1776029780596",
        destination: "/cikkek/miert-gorcsol-a-labad-este",
        permanent: true,
      },
      {
        source: "/termekcimke/:slug*",
        destination: "/termek",
        permanent: true,
      },
      {
        source: "/osszetevo/:slug*",
        destination: "/termek",
        permanent: true,
      },
      {
        source: "/panaszok/:slug*",
        destination: "/cikkek",
        permanent: true,
      },
      {
        source: "/optimalis-megoldas/:path*",
        destination: "/cikkek",
        permanent: true,
      },
      {
        source: "/category/:path*",
        destination: "/cikkek",
        permanent: true,
      },
      {
        source: "/jolet-felelos",
        destination: "/cikkek",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
