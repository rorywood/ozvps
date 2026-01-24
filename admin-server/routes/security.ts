import { Router, Request, Response } from "express";
import { dbStorage } from "../../server/storage";
import { auditSuccess, auditFailure } from "../utils/audit-log";
import { z } from "zod";

export function registerSecurityRoutes(router: Router): void {

  // Get reCAPTCHA settings
  router.get("/security/recaptcha", async (req: Request, res: Response) => {
    try {
      const settings = await dbStorage.getRecaptchaSettingsAsync();
      res.json({
        enabled: settings.enabled,
        siteKey: settings.siteKey || '',
        hasSecretKey: !!settings.secretKey,
        version: settings.version,
        minScore: settings.minScore,
      });
    } catch (error: any) {
      console.log(`[admin-security] Error fetching reCAPTCHA settings: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch reCAPTCHA settings" });
    }
  });

  // Update reCAPTCHA settings
  router.post("/security/recaptcha", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;

      const schema = z.object({
        siteKey: z.string().min(1, "Site key is required"),
        secretKey: z.string().optional(),
        enabled: z.boolean(),
        version: z.enum(["v2", "v3"]).default("v3"),
        minScore: z.number().min(0).max(1).optional().default(0.5),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const { siteKey, secretKey, enabled, version, minScore } = parsed.data;

      // Get existing settings to preserve secret key if not provided
      const existingSettings = await dbStorage.getRecaptchaSettingsAsync();
      const finalSecretKey = secretKey && secretKey.trim() ? secretKey : existingSettings.secretKey;

      // Require secret key if none exists
      if (!finalSecretKey) {
        return res.status(400).json({ error: "Secret key is required" });
      }

      // Validate key format (only if new secret key provided)
      if (secretKey && secretKey.trim()) {
        const validation = await dbStorage.testRecaptchaConfig(siteKey, secretKey);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      await dbStorage.updateRecaptchaSettings({
        siteKey,
        secretKey: finalSecretKey,
        enabled,
        version,
        minScore,
      });

      await auditSuccess(req, "security.recaptcha.update", "security", "recaptcha", undefined, {
        enabled,
        version,
        minScore,
      });

      console.log(`[admin-security] reCAPTCHA settings updated by ${session.email}: enabled=${enabled}, version=${version}`);
      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "security.recaptcha.update", "security", error.message);
      console.log(`[admin-security] Error updating reCAPTCHA settings: ${error.message}`);
      res.status(500).json({ error: "Failed to update reCAPTCHA settings" });
    }
  });

  // Test reCAPTCHA configuration
  router.post("/security/recaptcha/test", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        siteKey: z.string().min(1, "Site key is required"),
        secretKey: z.string().min(1, "Secret key is required"),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const validation = await dbStorage.testRecaptchaConfig(parsed.data.siteKey, parsed.data.secretKey);
      res.json(validation);
    } catch (error: any) {
      console.log(`[admin-security] Error testing reCAPTCHA config: ${error.message}`);
      res.status(500).json({ error: "Failed to test reCAPTCHA configuration" });
    }
  });
}
