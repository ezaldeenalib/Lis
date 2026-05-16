/** @type {import('next').NextConfig} */
const apiProxyTarget =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

const nextConfig = {
  reactStrictMode: process.env.NODE_ENV === 'production',
  output: 'standalone',
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
      // Socket.IO (Engine.IO) — lets clients use same-origin in dev if NEXT_PUBLIC_API_URL is unset
      {
        source: '/socket.io/:path*',
        destination: `${base}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
