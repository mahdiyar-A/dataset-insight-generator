import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server and only the node_modules the
  // app actually imports. The Docker image copies that instead of the full
  // dependency tree — roughly an order of magnitude smaller.
  output: "standalone",

  // The guest dashboard is gone: an anonymous visitor can't be told apart, so
  // there was no way to keep its analyses fair. The demo shows the product, and
  // a free account runs it on your own data. Old links and search results land
  // on the demo.
  async redirects() {
    return [{ source: "/guestDashboard", destination: "/demo", permanent: true }];
  },

  images: {
    // remotePatterns rather than the deprecated `domains`: this pins the
    // protocol and path prefix, so only the public storage bucket can be
    // proxied through the image optimizer.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rougcvdaxcczynyxnyiz.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;