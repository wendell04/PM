/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const ssaUrl = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-inline' kept for Next.js hydration scripts; full removal requires nonce implementation
      // 'unsafe-eval' restricted to dev only — not needed in production builds
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'", // needed for inline <style> tags used in components
      "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://via.placeholder.com https://*.tile.openstreetmap.org https://unpkg.com https://server.arcgisonline.com",
      "font-src 'self'",
      `connect-src 'self' ${apiUrl} ${ssaUrl} https://api.paymongo.com https://nominatim.openstreetmap.org https://router.project-osrm.org ws: wss:`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  allowedDevOrigins: ['172.20.10.2'],
  async redirects() {
    return [
      {
        source: '/shop/orders',
        destination: '/shop/orders-history',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/broadcasting/:path*',
        destination: `${backendUrl}/broadcasting/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}

const hasSentry = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export default hasSentry
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;