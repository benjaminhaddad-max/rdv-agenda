import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Wrap Sentry uniquement si SENTRY_DSN est défini, sinon le wrap est neutre.
// On garde silent=true pour éviter de polluer les logs du build Vercel.
export default withSentryConfig(nextConfig, {
  silent: true,
  // Ne pas uploader les sourcemaps si pas configuré (besoin SENTRY_AUTH_TOKEN)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tunnel pour bypasser les ad-blockers côté client (optionnel)
  tunnelRoute: undefined,
});
