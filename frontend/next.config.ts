import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server and only the node_modules the
  // app actually imports. The Docker image copies that instead of the full
  // dependency tree — roughly an order of magnitude smaller.
  output: "standalone",

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