import { Router, Request, Response } from "express";
import { dbStorage } from "../../server/storage";
import { auth0Client } from "../../server/auth0";
import { auditSuccess, auditFailure } from "../utils/audit-log";
import { createPromoCodeSchema, updatePromoCodeSchema } from "../../shared/schema";

export function registerPromoCodeRoutes(router: Router) {
  // List all promo codes
  router.get("/promo-codes", async (req: Request, res: Response) => {
    try {
      const promoCodes = await dbStorage.getAllPromoCodes();

      res.json({ promoCodes });
    } catch (error: any) {
      console.log(`[admin-promo] List promo codes error: ${error.message}`);
      res.status(500).json({ error: "Failed to list promo codes" });
    }
  });

  // Get promo code details with usage history
  router.get("/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const promoCode = await dbStorage.getPromoCodeById(id);
      if (!promoCode) {
        return res.status(404).json({ error: "Promo code not found" });
      }

      // Get usage history
      const usageHistory = await dbStorage.getPromoCodeUsageHistory(id, 100);

      // Enrich usage history with user emails
      const enrichedUsage = await Promise.all(
        usageHistory.map(async (usage) => {
          let email: string | undefined;
          try {
            const user = await auth0Client.getUserById(usage.auth0UserId);
            email = user?.email;
          } catch {
            // User lookup failed
          }
          return {
            ...usage,
            userEmail: email,
          };
        })
      );

      res.json({ promoCode, usageHistory: enrichedUsage });
    } catch (error: any) {
      console.log(`[admin-promo] Get promo code error: ${error.message}`);
      res.status(500).json({ error: "Failed to get promo code" });
    }
  });

  // Create promo code
  router.post("/promo-codes", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;

      const parsed = createPromoCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const data = parsed.data;

      // Check for duplicate code
      const existing = await dbStorage.getPromoCodeByCode(data.code);
      if (existing) {
        return res.status(400).json({ error: "A promo code with this code already exists" });
      }

      // Validate percentage is within range
      if (data.discountType === "percentage" && (data.discountValue < 1 || data.discountValue > 100)) {
        return res.status(400).json({ error: "Percentage discount must be between 1 and 100" });
      }

      // Create the promo code
      const promoCode = await dbStorage.createPromoCode({
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        appliesTo: data.appliesTo,
        planIds: data.planIds || null,
        maxUsesTotal: data.maxUsesTotal || null,
        maxUsesPerUser: data.maxUsesPerUser,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        active: data.active,
        createdBy: session.auth0UserId,
      });

      // Audit log
      await auditSuccess(req, "promo.create", "promo_code", String(promoCode.id), promoCode.code, {
        discountType: data.discountType,
        discountValue: data.discountValue,
        appliesTo: data.appliesTo,
      });

      console.log(`[admin-promo] Promo code ${promoCode.code} created by ${session.email}`);

      res.status(201).json({ promoCode });
    } catch (error: any) {
      await auditFailure(req, "promo.create", "promo_code", error.message);
      console.log(`[admin-promo] Create promo code error: ${error.message}`);
      res.status(500).json({ error: "Failed to create promo code" });
    }
  });

  // Update promo code
  router.put("/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const parsed = updatePromoCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const data = parsed.data;

      // Check promo exists
      const existing = await dbStorage.getPromoCodeById(id);
      if (!existing) {
        return res.status(404).json({ error: "Promo code not found" });
      }

      // Validate percentage is within range
      if (data.discountType === "percentage" && data.discountValue !== undefined) {
        if (data.discountValue < 1 || data.discountValue > 100) {
          return res.status(400).json({ error: "Percentage discount must be between 1 and 100" });
        }
      }

      // Build update object
      const updates: Record<string, any> = {};
      if (data.discountType !== undefined) updates.discountType = data.discountType;
      if (data.discountValue !== undefined) updates.discountValue = data.discountValue;
      if (data.appliesTo !== undefined) updates.appliesTo = data.appliesTo;
      if (data.planIds !== undefined) updates.planIds = data.planIds;
      if (data.maxUsesTotal !== undefined) updates.maxUsesTotal = data.maxUsesTotal;
      if (data.maxUsesPerUser !== undefined) updates.maxUsesPerUser = data.maxUsesPerUser;
      if (data.validFrom !== undefined) updates.validFrom = data.validFrom ? new Date(data.validFrom) : null;
      if (data.validUntil !== undefined) updates.validUntil = data.validUntil ? new Date(data.validUntil) : null;
      if (data.active !== undefined) updates.active = data.active;

      const promoCode = await dbStorage.updatePromoCode(id, updates);

      // Audit log
      await auditSuccess(req, "promo.update", "promo_code", String(id), existing.code, updates);

      console.log(`[admin-promo] Promo code ${existing.code} updated by ${session.email}`);

      res.json({ promoCode });
    } catch (error: any) {
      await auditFailure(req, "promo.update", "promo_code", error.message, req.params.id);
      console.log(`[admin-promo] Update promo code error: ${error.message}`);
      res.status(500).json({ error: "Failed to update promo code" });
    }
  });

  // Toggle promo code active status
  router.post("/promo-codes/:id/toggle", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const existing = await dbStorage.getPromoCodeById(id);
      if (!existing) {
        return res.status(404).json({ error: "Promo code not found" });
      }

      const newActive = !existing.active;
      const promoCode = await dbStorage.updatePromoCode(id, { active: newActive });

      // Audit log
      await auditSuccess(req, newActive ? "promo.activate" : "promo.deactivate", "promo_code", String(id), existing.code);

      console.log(`[admin-promo] Promo code ${existing.code} ${newActive ? "activated" : "deactivated"} by ${session.email}`);

      res.json({ promoCode });
    } catch (error: any) {
      await auditFailure(req, "promo.toggle", "promo_code", error.message, req.params.id);
      console.log(`[admin-promo] Toggle promo code error: ${error.message}`);
      res.status(500).json({ error: "Failed to toggle promo code" });
    }
  });

  // Delete promo code
  router.delete("/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;
      const { confirm } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Confirmation required. Send { confirm: 'DELETE' } to confirm." });
      }

      const existing = await dbStorage.getPromoCodeById(id);
      if (!existing) {
        return res.status(404).json({ error: "Promo code not found" });
      }

      await dbStorage.deletePromoCode(id);

      // Audit log
      await auditSuccess(req, "promo.delete", "promo_code", String(id), existing.code);

      console.log(`[admin-promo] Promo code ${existing.code} deleted by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "promo.delete", "promo_code", error.message, req.params.id);
      console.log(`[admin-promo] Delete promo code error: ${error.message}`);
      res.status(500).json({ error: "Failed to delete promo code" });
    }
  });

  // Get promo code stats
  router.get("/promo-codes-stats", async (req: Request, res: Response) => {
    try {
      const promoCodes = await dbStorage.getAllPromoCodes();

      const totalCodes = promoCodes.length;
      const activeCodes = promoCodes.filter((p) => p.active).length;
      const totalUsage = promoCodes.reduce((sum, p) => sum + p.currentUses, 0);

      res.json({
        totalCodes,
        activeCodes,
        inactiveCodes: totalCodes - activeCodes,
        totalUsage,
      });
    } catch (error: any) {
      console.log(`[admin-promo] Get stats error: ${error.message}`);
      res.status(500).json({ error: "Failed to get promo code stats" });
    }
  });
}
