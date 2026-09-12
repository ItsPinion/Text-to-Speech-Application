// Dev (single origin): the browser calls /api same-origin and Next proxies it
// to the api on :4000 — no CORS in dev. Production is two origins (C6:
// Vercel web + Render api, Phase 20): NEXT_PUBLIC_API_URL points straight at
// the Render origin, so the rewrite is disabled there.
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
