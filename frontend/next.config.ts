import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker standalone output for minimal production image
  output: 'standalone',

  // Proxy API requests to the backend (Nginx or management layer)
  rewrites: async () => [
    {
      source: '/api/v1/:path*',
      destination: process.env.NEXT_PUBLIC_API_URL
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*`
        : 'http://nginx:8080/api/v1/:path*',
    },
  ],
};

export default nextConfig;
