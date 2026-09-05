/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const ssaUrl = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-inline' kept for Next.js hydration scripts; full removal requires nonce implementation
      // 'unsafe-eval' restricted to dev only — not needed in production builds
      `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://maps.googleapis.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      // fonts.googleapis.com belongs here, not only in font-src. The Google Fonts <link> is a
      // STYLESHEET - font-src governs the .woff2 files it goes on to request, style-src governs the
      // stylesheet itself. With only 'self' here the browser blocked the whole thing, no @font-face
      // rules ever arrived, and every device fell back to its own sans-serif. On the live site it had
      // never once rendered the brand fonts; localhost has no CSP, which is why it looked right there.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline <style> tags + Google Fonts
      // Without an explicit media-src, <video> and <audio> fall back to default-src ('self'), so a
      // Cloudinary-hosted proof clip is blocked before it is ever fetched - the player just sits at
      // 0:00 with no error in the UI. Images were unaffected because img-src names Cloudinary, which
      // is why a poster frame appeared while the video itself never played. blob: is needed for the
      // admin's locally staged file before it is uploaded.
      "media-src 'self' data: blob: https://res.cloudinary.com",
      "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://via.placeholder.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://server.arcgisonline.com https://maps.gstatic.com https://*.gstatic.com https://maps.googleapis.com https://*.googleapis.com https://*.ggpht.com",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' ${apiUrl} ${ssaUrl} https://api.paymongo.com https://nominatim.openstreetmap.org https://api.tomtom.com https://places.googleapis.com https://maps.googleapis.com https://router.project-osrm.org https://psgc.gitlab.io https://challenges.cloudflare.com ws: wss:`,
      // Cloudflare Turnstile renders its challenge inside an iframe from challenges.cloudflare.com
      "frame-src 'self' https://challenges.cloudflare.com",
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