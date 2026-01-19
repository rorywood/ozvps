import { Router, Request, Response } from "express";
import { virtfusionClient } from "../../server/virtfusion";

export function registerVirtFusionRoutes(router: Router) {
  // Get VirtFusion hypervisors
  router.get("/vf/hypervisors", async (req: Request, res: Response) => {
    try {
      const hypervisors = await virtfusionClient.getHypervisors();
      res.json({ hypervisors: hypervisors.data || hypervisors });
    } catch (error: any) {
      console.log(`[admin-vf] Get hypervisors error: ${error.message}`);
      res.status(500).json({ error: "Failed to get hypervisors" });
    }
  });

  // Get hypervisor details
  router.get("/vf/hypervisors/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid hypervisor ID" });
      }

      const hypervisor = await virtfusionClient.getHypervisor(id);
      res.json({ hypervisor });
    } catch (error: any) {
      console.log(`[admin-vf] Get hypervisor error: ${error.message}`);
      res.status(500).json({ error: "Failed to get hypervisor" });
    }
  });

  // Get hypervisor groups
  router.get("/vf/hypervisor-groups", async (req: Request, res: Response) => {
    try {
      const groups = await virtfusionClient.getHypervisorGroups();
      res.json({ groups: groups.data || groups });
    } catch (error: any) {
      console.log(`[admin-vf] Get hypervisor groups error: ${error.message}`);
      res.status(500).json({ error: "Failed to get hypervisor groups" });
    }
  });

  // Get IP blocks
  router.get("/vf/ip-blocks", async (req: Request, res: Response) => {
    try {
      const ipBlocks = await virtfusionClient.getIpBlocks();
      res.json({ ipBlocks: ipBlocks.data || ipBlocks });
    } catch (error: any) {
      console.log(`[admin-vf] Get IP blocks error: ${error.message}`);
      res.status(500).json({ error: "Failed to get IP blocks" });
    }
  });

  // Get IP allocations
  router.get("/vf/ip-allocations", async (req: Request, res: Response) => {
    try {
      const allocations = await virtfusionClient.getIpAllocations();
      res.json({ allocations: allocations.data || allocations });
    } catch (error: any) {
      console.log(`[admin-vf] Get IP allocations error: ${error.message}`);
      res.status(500).json({ error: "Failed to get IP allocations" });
    }
  });

  // List VirtFusion users
  router.get("/vf/users", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 50, 100);

      const users = await virtfusionClient.listUsers(page, perPage);
      res.json({
        users: users.data || users,
        pagination: users.links || null,
        meta: users.meta || null,
      });
    } catch (error: any) {
      console.log(`[admin-vf] List users error: ${error.message}`);
      res.status(500).json({ error: "Failed to list VirtFusion users" });
    }
  });

  // Get VirtFusion user
  router.get("/vf/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await virtfusionClient.getUser(id);
      res.json({ user });
    } catch (error: any) {
      console.log(`[admin-vf] Get user error: ${error.message}`);
      res.status(500).json({ error: "Failed to get VirtFusion user" });
    }
  });

  // Delete VirtFusion user
  router.delete("/vf/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { confirm } = req.body;
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Must confirm deletion" });
      }

      await virtfusionClient.deleteUser(id);

      console.log(`[admin-vf] VirtFusion user ${id} deleted by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      console.log(`[admin-vf] Delete user error: ${error.message}`);
      res.status(500).json({ error: "Failed to delete VirtFusion user" });
    }
  });

  // Get packages
  router.get("/vf/packages", async (req: Request, res: Response) => {
    try {
      const packages = await virtfusionClient.getPackages();
      res.json({ packages: packages.data || packages });
    } catch (error: any) {
      console.log(`[admin-vf] Get packages error: ${error.message}`);
      res.status(500).json({ error: "Failed to get packages" });
    }
  });

  // Get package templates
  router.get("/vf/packages/:id/templates", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid package ID" });
      }

      const templates = await virtfusionClient.getPackageTemplates(id);
      res.json({ templates: templates.data || templates });
    } catch (error: any) {
      console.log(`[admin-vf] Get templates error: ${error.message}`);
      res.status(500).json({ error: "Failed to get package templates" });
    }
  });

  // Get VirtFusion stats
  router.get("/vf/stats", async (req: Request, res: Response) => {
    try {
      const stats = await virtfusionClient.getStats();
      res.json({ stats });
    } catch (error: any) {
      console.log(`[admin-vf] Get stats error: ${error.message}`);
      res.status(500).json({ error: "Failed to get VirtFusion stats" });
    }
  });

  // Create VirtFusion user
  router.post("/vf/users", async (req: Request, res: Response) => {
    try {
      const { email, name, password } = req.body;
      const session = req.adminSession!;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await virtfusionClient.createUser(email, name, password);

      console.log(`[admin-vf] VirtFusion user created: ${email} by ${session.email}`);

      res.json({ user });
    } catch (error: any) {
      console.log(`[admin-vf] Create user error: ${error.message}`);
      res.status(500).json({ error: "Failed to create VirtFusion user" });
    }
  });
}
