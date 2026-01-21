import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { connectRedis, disconnectRedis } from "../server/redis";
import { runAutoMigrations } from "../server/db";
// import { ipWhitelistMiddleware } from "./middleware/ip-whitelist"; // TEMPORARILY DISABLED
import { adminAuthMiddleware } from "./middleware/admin-auth";
import { csrfMiddleware } from "./middleware/csrf";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoutes } from "./routes/health";
import { registerWhitelistRoutes } from "./routes/whitelist";
import { registerUsersRoutes } from "./routes/users";
import { registerServersRoutes } from "./routes/servers";
import { registerBillingRoutes } from "./routes/billing";
import { registerTicketsRoutes } from "./routes/tickets";
import { registerVirtFusionRoutes } from "./routes/virtfusion";
import { registerSettingsRoutes } from "./routes/settings";
import { registerPromoCodeRoutes } from "./routes/promo-codes";
import { setupLogWebSocket } from "./websocket/logs";

const app = express();
const httpServer = createServer(app);

// WebSocket server for log streaming
const wss = new WebSocketServer({ server: httpServer, path: "/ws/logs" });
setupLogWebSocket(wss);

function log(message: string, source = "admin") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${source}] ${message}`);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
}));

// Response compression
if (process.env.NODE_ENV === 'production') {
  app.use(compression({ level: 6, threshold: 1024 }));
}

// Rate limiting - stricter for admin panel
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Very strict rate limit for 2FA - prevents brute force
const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Only 5 attempts per 5 minutes
  message: { error: 'Too many 2FA attempts. Please wait 5 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Strict limit for dangerous operations
const dangerousOpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 dangerous operations per minute
  message: { error: 'Too many operations. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-2fa', twoFactorLimiter);
app.use('/api/users/:id/block', dangerousOpLimiter);
app.use('/api/users/:id/suspend', dangerousOpLimiter);
app.use('/api/users/:id/wallet/adjust', dangerousOpLimiter);
app.use('/api/billing/records/:id/suspend', dangerousOpLimiter);
app.use('/api/billing/records/:id/unsuspend', dangerousOpLimiter);
app.use('/api/servers/:id/delete', dangerousOpLimiter);
app.use('/api/', apiLimiter);

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());

// IP whitelist check - TEMPORARILY DISABLED
// TODO: Re-enable IP whitelist when ready
// app.use((req, res, next) => {
//   if (req.path === '/api/health' || req.path === '/health') {
//     return next();
//   }
//   return ipWhitelistMiddleware(req, res, next);
// });

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Register routes
(async () => {
  // Initialize Redis
  await connectRedis();

  // Run database migrations
  try {
    await runAutoMigrations();
    log('Database migrations complete', 'db');
  } catch (error: any) {
    log(`Database migration warning: ${error.message}`, 'db');
  }

  // Public routes (no auth required)
  registerHealthRoutes(app);
  registerAuthRoutes(app);

  // Protected routes (require authentication)
  const protectedRouter = express.Router();
  protectedRouter.use(adminAuthMiddleware);
  protectedRouter.use(csrfMiddleware);

  registerWhitelistRoutes(protectedRouter);
  registerUsersRoutes(protectedRouter);
  registerServersRoutes(protectedRouter);
  registerBillingRoutes(protectedRouter);
  registerTicketsRoutes(protectedRouter);
  registerVirtFusionRoutes(protectedRouter);
  registerSettingsRoutes(protectedRouter);
  registerPromoCodeRoutes(protectedRouter);

  app.use('/api', protectedRouter);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "An unexpected error occurred" : err.message;
    log(`Error: ${err.message}`, 'error');
    res.status(status).json({ error: message });
  });

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    const path = await import("path");
    const staticPath = path.resolve(process.cwd(), "admin-dist", "client");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port = parseInt(process.env.ADMIN_PORT || "5001", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`Admin panel server running on port ${port}`);
    log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log(`${signal} received, shutting down...`, 'server');
    await disconnectRedis();
    httpServer.close(() => {
      log('Server closed', 'server');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
