import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a second dev server (e.g. APP_MODE=live on another port) run beside the default one.
  // Only set when asked for, so the default server's config is unchanged.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  devIndicators: false,
  experimental: {
    // Next's dev MCP endpoint appends forwarded browser console output to
    // .next/dev/logs/next-development.log. On this setup a restart with an existing log file
    // made the dev watcher react to each write and reload every open tab in a loop.
    mcpServer: false,
  },
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "embedded-postgres", "@prisma/client", "pg"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/hashtag/:tag", destination: "/search?q=%23:tag", permanent: false }];
  },
};

export default nextConfig;
