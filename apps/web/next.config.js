const path = require('path');

/**
 * Server-side rewrites (Next Node server → API). Evaluated at **build time**.
 * - API_INTERNAL_URL: Docker bridge hostname (e.g. http://api:4000). Never use this in browser code.
 * - NEXT_PUBLIC_API_URL: Fallback only if internal unset (prefer explicit API_INTERNAL_URL in Docker builds).
 */
const apiProxyTarget =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

const nextConfig = {
  reactStrictMode: process.env.NODE_ENV === 'production',

  /** Required for Docker: emits `.next/standalone` with `apps/web/server.js`. */
  output: 'standalone',

  /**
   * Monorepo root for file tracing — ensures standalone bundle includes workspace
   * deps (`libs/shared`, hoisted `node_modules`) correctly.
   */
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },

  transpilePackages: ['@lis/shared'],

  async rewrites() {
    const base = apiProxyTarget.replace(/\/$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${base}/api/:path*`,
      },
      {
        source: '/platform/:path*',
        destination: `${base}/platform/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${base}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
