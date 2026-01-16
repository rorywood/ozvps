/**
 * Sentry Error Tracking Configuration
 * Initializes Sentry for error monitoring and performance tracking
 */

import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

let sentryInitialized = false;

/**
 * Initialize Sentry error tracking
 * Should be called at the very start of the application
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('ℹ️  Sentry DSN not configured - error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,

      // Performance monitoring sample rate (0.0 to 1.0)
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Only send errors in production by default
      enabled: process.env.NODE_ENV === 'production' || !!process.env.SENTRY_DSN,

      // Filter out sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-csrf-token'];
        }

        // Remove sensitive cookies
        if (event.request?.cookies) {
          event.request.cookies = '[Filtered]';
        }

        return event;
      },

      // Ignore common non-actionable errors
      ignoreErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EPIPE',
        'Request aborted',
        'Network request failed',
      ],
    });

    sentryInitialized = true;
    console.log(`✅ Sentry initialized (environment: ${SENTRY_ENVIRONMENT})`);
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error);
  }
}

/**
 * Capture an exception and send to Sentry
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!sentryInitialized) {
    console.error('Sentry not initialized, error not captured:', error.message);
    return;
  }

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message and send to Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!sentryInitialized) {
    console.log('Sentry not initialized, message not captured:', message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry events
 */
export function setUser(user: { id?: string; email?: string; username?: string } | null): void {
  if (!sentryInitialized) return;
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (!sentryInitialized) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Express error handler middleware for Sentry
 * Must be added after all routes
 */
export const sentryErrorHandler = Sentry.Handlers.errorHandler();

/**
 * Express request handler middleware for Sentry
 * Must be added before all routes
 */
export const sentryRequestHandler = Sentry.Handlers.requestHandler();

/**
 * Check if Sentry is initialized
 */
export function isSentryEnabled(): boolean {
  return sentryInitialized;
}
