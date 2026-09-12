// Dev only: the browser calls /api same-origin and Next proxies it to the
// api process/container. In production Caddy routes /api/* directly to the
// api service (Phase 20), so the rewrite is disabled there.
const nextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
