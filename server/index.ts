import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { runMigrations } from 'stripe-replit-sync';
import { registerRoutes } from "./routes";
import { registerInstallAssets } from "./install-assets";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startCancellationProcessor } from "./cancellation-processor";
import { startOrphanCleanupProcessor } from "./orphan-cleanup-processor";
import { startBillingProcessor } from "./billing-processor";

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
      /^\/?\.env/i,
      /^\/?\.git/i,
      /^\/?\.config/i,
      /^\/?package\.json$/i,
      /^\/?package-lock\.json$/i,
      /^\/?tsconfig/i,
      /^\/?vite\.config/i,
      /^\/?drizzle\.config/i,
      /^\/?replit\.md$/i,
      /^\/?node_modules\//i,
      /^\/?server\//i,
      /^\/?shared\//i,
    ];
    
    const reqPath = req.path.toLowerCase();
    if (blockedPatterns.some(pattern => pattern.test(reqPath))) {
      return res.status(404).send('Not found');
    }
    next();
  });
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
}));

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

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
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

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
  // Initialize Stripe schema and sync data on startup
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      log('Initializing Stripe schema...', 'stripe');
      await runMigrations({ databaseUrl, schema: 'stripe' });
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
      
      // Start background job for processing server cancellations
      startCancellationProcessor();
      
      // Start background job for cleaning up orphaned accounts (deleted Auth0 users)
      startOrphanCleanupProcessor();
      
      // Start background job for server billing and auto top-ups
      getUncachableStripeClient()
        .then(stripe => startBillingProcessor(stripe))
        .catch(() => startBillingProcessor(null));
    },
  );
})();
