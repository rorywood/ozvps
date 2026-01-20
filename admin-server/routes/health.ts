import { Express, Request, Response } from "express";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { redisClient } from "../../server/redis";
import os from "os";
import { exec } from "child_process";

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
  const apiUrl = process.env.VIRTFUSION_PANEL_URL;
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
    // Use hypervisors endpoint with minimal results for health check
    const response = await fetch(`${apiUrl}/api/v1/compute/hypervisors?results=1`, {
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

async function getDiskStats(): Promise<{ total: number; used: number; free: number; usagePercent: number } | null> {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === "linux" || platform === "darwin") {
      exec("df -k / | tail -1 | awk '{print $2,$3,$4}'", (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const [total, used, free] = stdout.trim().split(" ").map(Number);
        if (!total || isNaN(total)) {
          resolve(null);
          return;
        }
        resolve({
          total: Math.round(total / 1024), // MB
          used: Math.round(used / 1024),
          free: Math.round(free / 1024),
          usagePercent: Math.round((used / total) * 100),
        });
      });
    } else {
      // Windows fallback - just return null for now
      resolve(null);
    }
  });
}

async function getDatabaseStats(): Promise<{ size: string; connections: number; tables: number } | null> {
  try {
    // Get database size
    const sizeResult = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
    const size = (sizeResult.rows[0] as any)?.size || "Unknown";

    // Get active connections
    const connectionsResult = await db.execute(sql`SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'`);
    const connections = parseInt((connectionsResult.rows[0] as any)?.count || "0", 10);

    // Get table count
    const tablesResult = await db.execute(sql`SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = parseInt((tablesResult.rows[0] as any)?.count || "0", 10);

    return { size, connections, tables };
  } catch (error) {
    return null;
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

// Map service names to possible systemd service names (tries in order)
// Note: ozvps-admin intentionally excluded - admins should not control the admin panel from itself
const serviceMap: Record<string, string[]> = {
  "postgresql": ["postgresql", "postgresql-15", "postgresql-14", "postgres"],
  "redis": ["redis-server", "redis"],
  "ozvps": ["ozvps", "ozvps-panel", "ozvps-app"],
};

// Find which service name actually exists
async function findServiceName(service: string): Promise<string | null> {
  const possibleNames = serviceMap[service];
  if (!possibleNames) return null;

  for (const name of possibleNames) {
    const exists = await new Promise<boolean>((resolve) => {
      exec(`systemctl list-unit-files ${name}.service 2>/dev/null | grep -q ${name}`, (error) => {
        resolve(!error);
      });
    });
    if (exists) return name;
  }
  return possibleNames[0]; // Fall back to first option
}

// Service control helper
async function controlService(service: string, action: "start" | "stop" | "restart"): Promise<{ success: boolean; message: string }> {
  const platform = os.platform();

  if (platform !== "linux") {
    return { success: false, message: "Service control only available on Linux" };
  }

  // Don't allow controlling the admin panel from itself
  if (service === "ozvps-admin") {
    return { success: false, message: "Cannot control admin panel from itself" };
  }

  const systemdService = await findServiceName(service);
  if (!systemdService) {
    return { success: false, message: `Unknown service: ${service}` };
  }

  return new Promise((resolve) => {
    exec(`systemctl ${action} ${systemdService}`, (error, _stdout, stderr) => {
      if (error) {
        // Check if service doesn't exist
        if (stderr.includes("not found") || stderr.includes("No such file")) {
          resolve({ success: false, message: `Service ${systemdService} not found on this system` });
        } else {
          resolve({ success: false, message: stderr || error.message });
        }
      } else {
        resolve({ success: true, message: `Service ${systemdService} ${action}ed successfully` });
      }
    });
  });
}

// Get service status
async function getServiceStatus(service: string): Promise<{ running: boolean; enabled: boolean; exists: boolean }> {
  const platform = os.platform();

  if (platform !== "linux") {
    return { running: false, enabled: false, exists: false };
  }

  const systemdService = await findServiceName(service);
  if (!systemdService) {
    return { running: false, enabled: false, exists: false };
  }

  return new Promise((resolve) => {
    exec(`systemctl is-active ${systemdService} 2>/dev/null; systemctl is-enabled ${systemdService} 2>/dev/null`, (error, stdout) => {
      const lines = stdout.trim().split("\n");
      const isActive = lines[0] === "active";
      const isEnabled = lines[1] === "enabled";
      // Service exists if we got any valid response
      const exists = lines[0] !== "" && !lines[0].includes("could not be found");
      resolve({
        running: isActive,
        enabled: isEnabled,
        exists: exists,
      });
    });
  });
}

export function registerHealthRoutes(app: Express) {
  // Basic health check (for load balancers) - use /healthz to avoid conflict with frontend /health route
  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Service control endpoint
  app.post("/api/services/:service/:action", async (req: Request, res: Response) => {
    const { service, action } = req.params;

    if (!["start", "stop", "restart"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be start, stop, or restart" });
    }

    if (!["postgresql", "redis", "ozvps", "ozvps-admin"].includes(service)) {
      return res.status(400).json({ error: "Unknown service" });
    }

    const result = await controlService(service, action as "start" | "stop" | "restart");

    if (result.success) {
      console.log(`[admin-health] Service ${service} ${action}ed`);
      res.json(result);
    } else {
      res.status(500).json({ error: result.message });
    }
  });

  // Get all service statuses (excluding admin panel)
  app.get("/api/services/status", async (_req: Request, res: Response) => {
    const services = ["postgresql", "redis", "ozvps"];
    const statuses: Record<string, { running: boolean; enabled: boolean; exists: boolean }> = {};

    await Promise.all(
      services.map(async (service) => {
        statuses[service] = await getServiceStatus(service);
      })
    );

    res.json({ services: statuses });
  });

  // Detailed health check (requires auth in production, but middleware is applied separately)
  app.get("/api/health", async (_req: Request, res: Response) => {
    const [database, redis, virtfusion, stripe, disk, dbStats] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkVirtFusion(),
      checkStripe(),
      getDiskStats(),
      getDatabaseStats(),
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
      system: {
        ...getSystemStats(),
        disk,
      },
      database: dbStats,
    });
  });

  // Detailed health check (protected version)
  app.get("/api/admin/health/detailed", async (_req: Request, res: Response) => {
    const [database, redis, virtfusion, stripe, disk, dbStats] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkVirtFusion(),
      checkStripe(),
      getDiskStats(),
      getDatabaseStats(),
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
      system: {
        ...getSystemStats(),
        disk,
      },
      database: dbStats,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        nodeVersion: process.version,
        appDomain: process.env.APP_DOMAIN,
      },
    });
  });
}
