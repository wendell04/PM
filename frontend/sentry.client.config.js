import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Replay 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Trace 10% of navigations for performance monitoring
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,   // mask all text to protect PII
        blockAllMedia: true,
      }),
    ],
    // Don't send PII — strip cookies and auth headers
    sendDefaultPii: false,
  });
}
