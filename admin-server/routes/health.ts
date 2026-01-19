import { Express, Request, Response } from "express";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { redisClient } from "../../server/redis";
import os from "os";

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
}

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      name: "PostgreSQL",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: "PostgreSQL",
      status: "unhealthy",
      message: error.message,
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isReady) {
      return {
        name: "Redis",
        status: "unhealthy",
        message: "Not connected",
      };
    }
    await redisClient.ping();
    return {
      name: "Redis",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: "Redis",
      status: "unhealthy",
      message: error.message,
    };
  }
}

async function checkVirtFusion(): Promise<ServiceHealth> {
  const apiUrl = process.env.VIRTFUSION_API_URL;
  const apiToken = process.env.VIRTFUSION_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return {
      name: "VirtFusion",
      status: "unhealthy",
      message: "Not configured",
    };
  }

  const start = Date.now();
  try {
    const response = await fetch(`${apiUrl}/api/v1/self`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        name: "VirtFusion",
        status: "degraded",
        latencyMs: Date.now() - start,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      name: "VirtFusion",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: "VirtFusion",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
}

async function checkStripe(): Promise<ServiceHealth> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return {
      name: "Stripe",
      status: "unhealthy",
      message: "Not configured",
    };
  }

  const start = Date.now();
  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        name: "Stripe",
        status: "degraded",
        latencyMs: Date.now() - start,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      name: "Stripe",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: "Stripe",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
}

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const cpus = os.cpus();
  const cpuLoad = os.loadavg();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: Math.floor(os.uptime()),
    memory: {
      total: Math.round(totalMem / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      usagePercent: Math.round((usedMem / totalMem) * 100),
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || "Unknown",
      loadAvg: {
        "1min": cpuLoad[0]?.toFixed(2),
        "5min": cpuLoad[1]?.toFixed(2),
        "15min": cpuLoad[2]?.toFixed(2),
      },
    },
  };
}

export function registerHealthRoutes(app: Express) {
  // Basic health check (for load balancers)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Detailed health check (requires auth in production, but middleware is applied separately)
  app.get("/api/health", async (_req: Request, res: Response) => {
    const [database, redis, virtfusion, stripe] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkVirtFusion(),
      checkStripe(),
    ]);

    const services = [database, redis, virtfusion, stripe];
    const overallStatus = services.some(s => s.status === "unhealthy")
      ? "unhealthy"
      : services.some(s => s.status === "degraded")
      ? "degraded"
      : "healthy";

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      system: getSystemStats(),
    });
  });

  // Detailed health check (protected version)
  app.get("/api/admin/health/detailed", async (_req: Request, res: Response) => {
    const [database, redis, virtfusion, stripe] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkVirtFusion(),
      checkStripe(),
    ]);

    const services = [database, redis, virtfusion, stripe];
    const overallStatus = services.some(s => s.status === "unhealthy")
      ? "unhealthy"
      : services.some(s => s.status === "degraded")
      ? "degraded"
      : "healthy";

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      system: getSystemStats(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        nodeVersion: process.version,
        appDomain: process.env.APP_DOMAIN,
      },
    });
  });
}
