import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { adminAuditLogs, userAuditLogs } from "../../shared/schema";
import { desc, eq, like, or, and, gte, lte, sql } from "drizzle-orm";

export function registerAuditRoutes(router: Router) {
  // List admin audit log entries with filtering/pagination
  router.get("/audit/admin", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 50, 200);
      const offset = (page - 1) * perPage;

      const adminEmail = req.query.adminEmail as string;
      const action = req.query.action as string;
      const targetType = req.query.targetType as string;
      const status = req.query.status as string;
      const from = req.query.from as string;
      const to = req.query.to as string;

      const conditions: any[] = [];
      if (adminEmail) conditions.push(like(adminAuditLogs.adminEmail, `%${adminEmail}%`));
      if (action) conditions.push(like(adminAuditLogs.action, `%${action}%`));
      if (targetType) conditions.push(eq(adminAuditLogs.targetType, targetType));
      if (status) conditions.push(eq(adminAuditLogs.status, status));
      if (from) conditions.push(gte(adminAuditLogs.createdAt, new Date(from)));
      if (to) conditions.push(lte(adminAuditLogs.createdAt, new Date(to)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [logs, countResult] = await Promise.all([
        db.select().from(adminAuditLogs)
          .where(where)
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(perPage)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs).where(where),
      ]);

      res.json({
        logs,
        total: countResult[0]?.count ?? 0,
        page,
        perPage,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // List user audit log entries with filtering/pagination
  router.get("/audit/users", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 50, 200);
      const offset = (page - 1) * perPage;

      const email = req.query.email as string;
      const action = req.query.action as string;
      const from = req.query.from as string;
      const to = req.query.to as string;

      const conditions: any[] = [];
      if (email) conditions.push(like(userAuditLogs.email, `%${email}%`));
      if (action) conditions.push(like(userAuditLogs.action, `%${action}%`));
      if (from) conditions.push(gte(userAuditLogs.createdAt, new Date(from)));
      if (to) conditions.push(lte(userAuditLogs.createdAt, new Date(to)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [logs, countResult] = await Promise.all([
        db.select().from(userAuditLogs)
          .where(where)
          .orderBy(desc(userAuditLogs.createdAt))
          .limit(perPage)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(userAuditLogs).where(where),
      ]);

      res.json({
        logs,
        total: countResult[0]?.count ?? 0,
        page,
        perPage,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch user audit logs" });
    }
  });
}
