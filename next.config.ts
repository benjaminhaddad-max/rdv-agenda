import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'unpdf'],
  // Plaquettes PDF jointes aux mails partenariat des lycées (lues sur disque)
  outputFileTracingIncludes: {
    '/api/crm/lycees/emails': ['./public/plaquettes/*.pdf'],
  },
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
      {
        source: "/events-studio",
        destination: "/events-studio/index.html",
      },
    ];
  },
};

export default nextConfig;
