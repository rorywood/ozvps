import { Router, Request, Response } from "express";
import { dbStorage } from "../../server/storage";
import { auditSuccess, auditFailure } from "../utils/audit-log";

export function registerSettingsRoutes(router: Router): void {

  // Get registration setting
  router.get("/settings/registration", async (req: Request, res: Response) => {
    try {
      const setting = await dbStorage.getSecuritySetting("registration_enabled");
      const enabled = setting
        ? setting.enabled
        : process.env.REGISTRATION_DISABLED !== "true";
      res.json({ enabled });
    } catch (error: any) {
      console.log(`[admin-settings] Error fetching registration setting: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch registration setting" });
    }
  });

  // Update registration setting
  router.put("/settings/registration", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      await dbStorage.upsertSecuritySetting("registration_enabled", null, enabled);

      // Audit log
      await auditSuccess(req, "settings.registration", "settings", "registration_enabled", undefined, { enabled });

      console.log(
        `[admin-settings] Registration ${enabled ? "enabled" : "disabled"} by ${session.email}`
      );

      res.json({ enabled });
    } catch (error: any) {
      await auditFailure(req, "settings.registration", "settings", error.message);
      console.log(`[admin-settings] Error updating registration setting: ${error.message}`);
      res.status(500).json({ error: "Failed to update registration setting" });
    }
  });

  // Get maintenance mode setting
  router.get("/settings/maintenance", async (req: Request, res: Response) => {
    try {
      const setting = await dbStorage.getSecuritySetting("maintenance_mode");
      const enabled = setting ? setting.enabled : false;
      res.json({ enabled });
    } catch (error: any) {
      console.log(`[admin-settings] Error fetching maintenance setting: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch maintenance setting" });
    }
  });

  // Update maintenance mode setting
  router.put("/settings/maintenance", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      await dbStorage.upsertSecuritySetting("maintenance_mode", null, enabled);

      await auditSuccess(req, "settings.maintenance", "settings", "maintenance_mode", undefined, { enabled });

      console.log(`[admin-settings] Maintenance mode ${enabled ? "enabled" : "disabled"} by ${session.email}`);

      res.json({ enabled });
    } catch (error: any) {
      await auditFailure(req, "settings.maintenance", "settings", error.message);
      console.log(`[admin-settings] Error updating maintenance setting: ${error.message}`);
      res.status(500).json({ error: "Failed to update maintenance setting" });
    }
  });
}
