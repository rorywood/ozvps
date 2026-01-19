import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { adminIpWhitelist, addIpWhitelistSchema } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { invalidateWhitelistCache, getClientIp } from "../middleware/ip-whitelist";

export function registerWhitelistRoutes(router: Router) {
  // List all whitelist entries
  router.get("/whitelist", async (req: Request, res: Response) => {
    const entries = await db
      .select()
      .from(adminIpWhitelist)
      .orderBy(desc(adminIpWhitelist.createdAt));

    res.json({ entries });
  });

  // Add new IP to whitelist
  router.post("/whitelist", async (req: Request, res: Response) => {
    const parsed = addIpWhitelistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { ipAddress, cidr, label, expiresAt } = parsed.data;
    const session = req.adminSession!;

    // Check for duplicate
    const existing = await db
      .select()
      .from(adminIpWhitelist)
      .where(eq(adminIpWhitelist.ipAddress, ipAddress));

    if (existing.length > 0) {
      return res.status(400).json({ error: "IP address already in whitelist" });
    }

    const [entry] = await db
      .insert(adminIpWhitelist)
      .values({
        ipAddress,
        cidr: cidr || null,
        label,
        addedBy: session.auth0UserId,
        addedByEmail: session.email,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        enabled: true,
      })
      .returning();

    invalidateWhitelistCache();

    console.log(`[admin-whitelist] IP ${ipAddress} added by ${session.email}`);

    res.json({ entry });
  });

  // Add current IP to whitelist (convenience method)
  router.post("/whitelist/add-current", async (req: Request, res: Response) => {
    const { label } = req.body;
    if (!label) {
      return res.status(400).json({ error: "Label is required" });
    }

    const session = req.adminSession!;
    const currentIp = getClientIp(req);

    // Check for duplicate
    const existing = await db
      .select()
      .from(adminIpWhitelist)
      .where(eq(adminIpWhitelist.ipAddress, currentIp));

    if (existing.length > 0) {
      return res.status(400).json({ error: "Your IP is already in the whitelist" });
    }

    const [entry] = await db
      .insert(adminIpWhitelist)
      .values({
        ipAddress: currentIp,
        cidr: null,
        label,
        addedBy: session.auth0UserId,
        addedByEmail: session.email,
        expiresAt: null,
        enabled: true,
      })
      .returning();

    invalidateWhitelistCache();

    console.log(`[admin-whitelist] Current IP ${currentIp} added by ${session.email}`);

    res.json({ entry, currentIp });
  });

  // Toggle whitelist entry enabled/disabled
  router.patch("/whitelist/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const { enabled, label, expiresAt } = req.body;

    const updateData: Record<string, any> = {};
    if (typeof enabled === "boolean") {
      updateData.enabled = enabled;
    }
    if (typeof label === "string") {
      updateData.label = label;
    }
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [entry] = await db
      .update(adminIpWhitelist)
      .set(updateData)
      .where(eq(adminIpWhitelist.id, id))
      .returning();

    if (!entry) {
      return res.status(404).json({ error: "Entry not found" });
    }

    invalidateWhitelistCache();

    console.log(`[admin-whitelist] Entry ${id} updated: ${JSON.stringify(updateData)}`);

    res.json({ entry });
  });

  // Delete whitelist entry
  router.delete("/whitelist/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const session = req.adminSession!;

    // Check if this would lock out the current admin
    const currentIp = getClientIp(req);
    const [entryToDelete] = await db
      .select()
      .from(adminIpWhitelist)
      .where(eq(adminIpWhitelist.id, id));

    if (entryToDelete && entryToDelete.ipAddress === currentIp) {
      // Check if there are other entries that would allow access
      const otherEntries = await db
        .select()
        .from(adminIpWhitelist)
        .where(eq(adminIpWhitelist.enabled, true));

      const otherValidEntries = otherEntries.filter(e => e.id !== id);
      if (otherValidEntries.length === 0) {
        return res.status(400).json({
          error: "Cannot delete - this would lock you out of the admin panel",
        });
      }
    }

    const deleted = await db
      .delete(adminIpWhitelist)
      .where(eq(adminIpWhitelist.id, id))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    invalidateWhitelistCache();

    console.log(`[admin-whitelist] Entry ${id} deleted by ${session.email}`);

    res.json({ success: true });
  });

  // Get current IP address
  router.get("/whitelist/current-ip", (req: Request, res: Response) => {
    const ip = getClientIp(req);
    res.json({ ip });
  });
}
