import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { runMigrations } from 'stripe-replit-sync';
import { registerRoutes } from "./routes";
import { dbStorage, initializeStorage } from "./storage";
import { registerInstallAssets } from "./install-assets";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startCancellationProcessor } from "./cancellation-processor";
import { startOrphanCleanupProcessor } from "./orphan-cleanup-processor";
import { startBillingProcessor } from "./billing-processor";
import { connectRedis, disconnectRedis, redisClient } from "./redis";
import { validateOrExit, getEnvironmentSummary } from "./env-validator";
import { initSentry, sentryRequestHandler, sentryErrorHandler, captureException } from "./sentry";

// CRITICAL: Initialize Sentry first (before anything else can fail)
initSentry();

// CRITICAL: Validate environment before doing anything else
// This prevents the app from starting with invalid/missing configuration
validateOrExit();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Block access to sensitive files and paths (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const blockedPatterns = [
      // Environment and config files
      /^\/?\.env/i,
      /^\/?\.git/i,
      /^\/?\.config/i,
      /^\/?package\.json$/i,
      /^\/?package-lock\.json$/i,
      /^\/?tsconfig/i,
      /^\/?vite\.config/i,
      /^\/?drizzle\.config/i,
      /^\/?ecosystem\.config/i,
      /^\/?replit\.md$/i,

      // Source code directories
      /^\/?node_modules\//i,
      /^\/?server\//i,
      /^\/?shared\//i,
      /^\/?client\//i,
      /^\/?src\//i,

      // Database and logs
      /^\/?migrations\//i,
      /^\/?logs?\//i,
      /\.log$/i,
      /\.sql$/i,
      /\.db$/i,
      /\.sqlite$/i,

      // Backups and sensitive files
      /\.bak$/i,
      /\.backup$/i,
      /\.old$/i,
      /\.tmp$/i,
      /\.key$/i,
      /\.pem$/i,
      /\.p12$/i,
      /\.pfx$/i,
      /\.crt$/i,
      /\.csr$/i,

      // Source maps (extra safety)
      /\.map$/i,

      // Documentation that might contain sensitive info
      /^\/?docs?\//i,
      /^\/?\.claude\//i,
    ];

    const reqPath = req.path.toLowerCase();
    if (blockedPatterns.some(pattern => pattern.test(reqPath))) {
      return res.status(404).send('Not found');
    }
    next();
  });
}

// Sentry request handler - must be first middleware
app.use(sentryRequestHandler);

// Security headers with enhanced configuration
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'none'", "https://js.stripe.com", "https://*.stripe.com", "https://www.google.com/recaptcha/", "https://recaptcha.google.com/"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  // Additional security headers
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  } : false,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  xssFilter: true,
}));

// Additional custom security headers
app.use((req, res, next) => {
  // Prevent browsers from performing MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Restrict feature usage
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
  next();
});

// Rate limiting for auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// SECURITY: Stricter rate limiting for wallet/payment operations
const walletLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 payment attempts per minute per IP
  message: { error: 'Too many payment attempts. Please wait a moment before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// SECURITY: Rate limiting for public/unauthenticated endpoints to prevent enumeration
const publicEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/wallet/topup', walletLimiter);
// Public endpoints that don't require auth still need rate limiting
app.use('/api/plans', publicEndpointLimiter);
app.use('/api/locations', publicEndpointLimiter);
app.use('/api/health', publicEndpointLimiter);
app.use('/api/security/recaptcha-config', publicEndpointLimiter);
app.use('/api/stripe/publishable-key', publicEndpointLimiter);
app.use('/api/', apiLimiter);
app.use('/install.sh', apiLimiter);
app.use('/update-ozvps.sh', apiLimiter);
app.use('/ozvps-panel.tar.gz', apiLimiter);

// Stripe webhook route MUST be registered BEFORE express.json()
// It needs raw Buffer for signature verification
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        log('Stripe webhook error: req.body is not a Buffer', 'stripe');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      log(`Stripe webhook error: ${error.message}`, 'stripe');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// SECURITY: Request body size limits to prevent DoS attacks
const MAX_JSON_SIZE = '100kb'; // Reasonable limit for most JSON payloads
const MAX_URL_ENCODED_SIZE = '50kb';

app.use(
  express.json({
    limit: MAX_JSON_SIZE,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: MAX_URL_ENCODED_SIZE }));
app.use(cookieParser());

// Sensitive fields to redact from logs
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie', 'accessToken', 'refreshToken', 'credentials'];

function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized: any = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeForLogging(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
}

// Re-export log from logger module for backwards compatibility
import { log as structuredLog, logger } from "./logger";

export function log(message: string, source = "express") {
  structuredLog(message, source);
}

export { logger };

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Sanitize sensitive data before logging
        const sanitized = sanitizeForLogging(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(sanitized)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Redis for session storage
  await connectRedis();
  initializeStorage(redisClient);

  // Initialize Stripe schema and sync data on startup
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      log('Initializing Stripe schema...', 'stripe');
      await runMigrations({ databaseUrl } as any);
      log('Stripe schema ready', 'stripe');

      const stripeSync = await getStripeSync();

      log('Setting up managed webhook...', 'stripe');
      const domains = process.env.REPLIT_DOMAINS?.split(',');
      if (domains && domains[0]) {
        const webhookBaseUrl = `https://${domains[0]}`;
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        log(`Webhook configured: ${result?.webhook?.url || 'managed'}`, 'stripe');
      } else {
        log('No REPLIT_DOMAINS set, skipping webhook setup', 'stripe');
      }

      // Sync Stripe data in background
      stripeSync.syncBackfill()
        .then(() => log('Stripe data synced', 'stripe'))
        .catch((err: Error) => log(`Error syncing Stripe data: ${err.message}`, 'stripe'));
    } else {
      log('DATABASE_URL not set, skipping Stripe initialization', 'stripe');
    }
  } catch (error: any) {
    log(`Stripe initialization warning: ${error.message}`, 'stripe');
  }

  await registerRoutes(httpServer, app);

  // Initialize reCAPTCHA settings cache
  try {
    await dbStorage.refreshRecaptchaCache();
    log('reCAPTCHA settings cache initialized', 'security');
  } catch (error: any) {
    log(`Warning: Failed to initialize reCAPTCHA cache: ${error.message}`, 'security');
  }

  // Sentry error handler - must be before other error handlers
  app.use(sentryErrorHandler);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Capture server errors (5xx) with Sentry
    if (status >= 500) {
      captureException(err, { status, message });
    }

    res.status(status).json({ message });
  });

  registerInstallAssets(app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      log('\n' + getEnvironmentSummary(), 'config');

      // Start background job for processing server cancellations
      startCancellationProcessor();

      // Start background job for cleaning up orphaned accounts (deleted Auth0 users)
      startOrphanCleanupProcessor();

      // Start background job for server billing and auto top-ups
      getUncachableStripeClient()
        .then(stripe => startBillingProcessor(stripe))
        .catch(() => startBillingProcessor(null));

      // Start background job for cleaning up expired password reset tokens
      setInterval(async () => {
        try {
          const deleted = await dbStorage.cleanupExpiredResetTokens();
          if (deleted > 0) {
            log(`Cleaned up ${deleted} expired password reset tokens`, 'security');
          }
        } catch (error: any) {
          log(`Error cleaning up reset tokens: ${error.message}`, 'security');
        }
      }, 60 * 60 * 1000); // Run every hour
      log('Password reset token cleanup job started (runs hourly)', 'security');
    },
  );

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    log('SIGTERM received, shutting down gracefully...', 'server');
    await disconnectRedis();
    httpServer.close(() => {
      log('Server closed', 'server');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    log('SIGINT received, shutting down gracefully...', 'server');
    await disconnectRedis();
    httpServer.close(() => {
      log('Server closed', 'server');
      process.exit(0);
    });
  });
})();
