import type { Express } from "express";
import { dbStorage } from "./storage";
import { getStripePublishableKey } from "./stripeClient";
import { log } from "./log";
import { getPublicLocations } from "@shared/locations";

export function registerPublicCatalogRoutes(app: Express) {
  app.get("/api/locations", async (_req, res) => {
    res.json({ locations: getPublicLocations() });
  });

  app.get("/api/plans", async (_req, res) => {
    try {
      const allPlans = await dbStorage.getAllPlans();
      const adminOnlyPlanIds = (process.env.ADMIN_ONLY_PLAN_IDS || "")
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));

      const publicPlans = adminOnlyPlanIds.length > 0
        ? allPlans.filter((plan) => !plan.virtfusionPackageId || !adminOnlyPlanIds.includes(plan.virtfusionPackageId))
        : allPlans;

      res.json({ plans: publicPlans });
    } catch (error: any) {
      log(`Error fetching plans: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      log(`Error getting Stripe publishable key: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to get Stripe configuration" });
    }
  });

  app.get("/api/billing/stripe/status", async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({
        configured: !!publishableKey,
        publishableKey,
      });
    } catch (error: any) {
      log(`Stripe not configured: ${error.message}`, "api");
      res.json({
        configured: false,
        error: "Stripe connector not set up",
      });
    }
  });
}
