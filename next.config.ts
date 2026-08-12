import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/crm-forms",
        destination: "/api/events-studio/crm-forms",
      },
      {
        source: "/api/preview-emails",
        destination: "/api/events-studio/preview-emails",
      },
      {
        source: "/q/:code",
        destination: "/api/events-studio/qr/:code",
      },
    ];
  },
};

export default nextConfig;
