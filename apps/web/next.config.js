/** @type {import('next').NextConfig} */
const apiProxyTarget =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

const nextConfig = {
  reactStrictMode: process.env.NODE_ENV === 'production',
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
    ];
  },
};

module.exports = nextConfig;
