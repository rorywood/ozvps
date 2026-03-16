import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { tickets, ticketMessages, userMappings, adminTicketUpdateSchema, ticketMessageSchema } from "../../shared/schema";
import { eq, desc, and, or, sql, isNull, ne } from "drizzle-orm";
import { auditSuccess, auditFailure } from "../utils/audit-log";
import { auth0Client } from "../../server/auth0";
import { sendTicketAdminReplyEmail, sendGuestTicketAdminReplyEmail, sendStaffRaisedTicketEmail } from "../../server/email";

export function registerTicketsRoutes(router: Router) {

  // Create a ticket on behalf of a user
  router.post("/tickets", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;
      const { auth0UserId, title, category, priority, message } = req.body;

      if (!auth0UserId || typeof auth0UserId !== "string") {
        return res.status(400).json({ error: "auth0UserId is required" });
      }
      if (!title || typeof title !== "string" || title.trim().length < 3) {
        return res.status(400).json({ error: "Title must be at least 3 characters" });
      }
      if (!message || typeof message !== "string" || message.trim().length < 10) {
        return res.status(400).json({ error: "Message must be at least 10 characters" });
      }

      const cleanTitle = title.trim().slice(0, 200);
      const cleanMessage = message.trim().slice(0, 5000);
      const ticketCategory = ["sales", "support", "accounts", "abuse"].includes(category) ? category : "support";
      const ticketPriority = ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";

      // Generate unique 6-digit ticket number
      let ticketNumber: number | undefined;
      for (let i = 0; i < 10; i++) {
        const candidate = Math.floor(100000 + Math.random() * 900000);
        const existing = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.ticketNumber, candidate)).limit(1);
        if (existing.length === 0) { ticketNumber = candidate; break; }
      }

      const [ticket] = await db
        .insert(tickets)
        .values({
          auth0UserId,
          ticketNumber,
          title: cleanTitle,
          category: ticketCategory,
          priority: ticketPriority,
          status: "waiting_user",
        })
        .returning();

      // Add the initial message as admin (on behalf of admin raising it)
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        authorType: "admin",
        authorId: session.auth0UserId,
        authorEmail: session.email,
        authorName: session.name,
        message: cleanMessage,
        isInternalNote: false,
      });

      // Update lastMessageAt
      await db.update(tickets).set({ lastMessageAt: new Date() }).where(eq(tickets.id, ticket.id));

      // Email the user
      auth0Client.getUserById(auth0UserId).then(auth0User => {
        if (auth0User?.email) {
          sendStaffRaisedTicketEmail(auth0User.email, ticket.id, cleanTitle, ticketCategory, ticketPriority, auth0User.name || null).catch(err => {
            console.log(`[admin-tickets] Failed to send new ticket email for ticket ${ticket.id}: ${err.message}`);
          });
        }
      }).catch(err => {
        console.log(`[admin-tickets] Failed to get Auth0 user for new ticket email on ticket ${ticket.id}: ${err.message}`);
      });

      await auditSuccess(req, "ticket.create_on_behalf", "ticket", String(ticket.id), undefined, { auth0UserId, title: cleanTitle, category: ticketCategory });

      console.log(`[admin-tickets] Ticket ${ticket.id} created on behalf of ${auth0UserId} by ${session.email}`);

      res.json({ ticket });
    } catch (error: any) {
      await auditFailure(req, "ticket.create_on_behalf", "ticket", error.message);
      console.log(`[admin-tickets] Create ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Get ticket counts by status
  router.get("/tickets/counts", async (req: Request, res: Response) => {
    try {
      const counts = await db
        .select({
          status: tickets.status,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .groupBy(tickets.status);

      res.json({
        counts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
      });
    } catch (error: any) {
      console.log(`[admin-tickets] Get counts error: ${error.message}`);
      res.status(500).json({ error: "Failed to get ticket counts" });
    }
  });

  // List tickets
  router.get("/tickets", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const category = req.query.category as string;
      const priority = req.query.priority as string;
      const assignedToMe = req.query.assignedToMe === "true";
      const unassigned = req.query.unassigned === "true";

      let whereConditions: any[] = [];

      if (status && status !== "all") {
        if (status === "open") {
          // "open" means all except closed
          whereConditions.push(ne(tickets.status, "closed"));
        } else {
          whereConditions.push(eq(tickets.status, status));
        }
      }

      if (category) {
        whereConditions.push(eq(tickets.category, category));
      }

      if (priority) {
        whereConditions.push(eq(tickets.priority, priority));
      }

      if (assignedToMe && req.adminSession) {
        whereConditions.push(eq(tickets.assignedAdminId, req.adminSession.auth0UserId));
      }

      if (unassigned) {
        whereConditions.push(isNull(tickets.assignedAdminId));
      }

      const ticketList = await db
        .select({
          ticket: tickets,
          user: {
            email: userMappings.email,
            name: userMappings.name,
          },
        })
        .from(tickets)
        .leftJoin(userMappings, eq(tickets.auth0UserId, userMappings.auth0UserId))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(tickets.lastMessageAt))
        .limit(limit)
        .offset(offset);

      res.json({ tickets: ticketList });
    } catch (error: any) {
      console.log(`[admin-tickets] List tickets error: ${error.message}`);
      res.status(500).json({ error: "Failed to list tickets" });
    }
  });

  // Get ticket details
  router.get("/tickets/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const [ticket] = await db
        .select({
          ticket: tickets,
          user: {
            email: userMappings.email,
            name: userMappings.name,
            auth0UserId: userMappings.auth0UserId,
          },
        })
        .from(tickets)
        .leftJoin(userMappings, eq(tickets.auth0UserId, userMappings.auth0UserId))
        .where(eq(tickets.id, id));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Get messages
      const messages = await db
        .select()
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, id))
        .orderBy(ticketMessages.createdAt);

      res.json({ ticket, messages });
    } catch (error: any) {
      console.log(`[admin-tickets] Get ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to get ticket" });
    }
  });

  // Add message to ticket
  router.post("/tickets/:id/messages", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const parsed = ticketMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { message } = parsed.data;
      const isInternalNote = req.body.isInternalNote === true;

      // Check ticket exists
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Add message
      const [newMessage] = await db
        .insert(ticketMessages)
        .values({
          ticketId: id,
          authorType: "admin",
          authorId: session.auth0UserId,
          authorEmail: session.email,
          authorName: session.name,
          message,
          isInternalNote,
        })
        .returning();

      // Internal notes don't change status or send emails
      if (!isInternalNote) {
        await db
          .update(tickets)
          .set({
            status: "waiting_user",
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, id));

        // Notify ticket author by email
        if (ticket.auth0UserId) {
          auth0Client.getUserById(ticket.auth0UserId).then(auth0User => {
            if (auth0User?.email) {
              sendTicketAdminReplyEmail(auth0User.email, id, ticket.ticketNumber ?? id, ticket.title, message).catch(err => {
                console.log(`[admin-tickets] Failed to send reply email for ticket ${id}: ${err.message}`);
              });
            }
          }).catch(err => {
            console.log(`[admin-tickets] Failed to get Auth0 user for reply email on ticket ${id}: ${err.message}`);
          });
        } else if (ticket.guestEmail && ticket.guestAccessToken) {
          sendGuestTicketAdminReplyEmail(ticket.guestEmail, id, ticket.ticketNumber ?? id, ticket.title, ticket.guestAccessToken, message).catch(err => {
            console.log(`[admin-tickets] Failed to send guest reply email for ticket ${id}: ${err.message}`);
          });
        }
      }

      // Audit log
      await auditSuccess(req, "ticket.message", "ticket", String(id));

      console.log(`[admin-tickets] ${isInternalNote ? 'Internal note' : 'Reply'} added to ticket ${id} by ${session.email}`);

      res.json({ message: newMessage });
    } catch (error: any) {
      await auditFailure(req, "ticket.message", "ticket", error.message, req.params.id);
      console.log(`[admin-tickets] Add message error: ${error.message}`);
      res.status(500).json({ error: "Failed to add message" });
    }
  });

  // Update ticket (status, priority, category, assignment)
  router.patch("/tickets/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const parsed = adminTicketUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (parsed.data.status !== undefined) {
        updateData.status = parsed.data.status;
        if (parsed.data.status === "resolved") {
          updateData.resolvedAt = new Date();
        } else if (parsed.data.status === "closed") {
          updateData.closedAt = new Date();
        }
      }
      if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
      if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
      if (parsed.data.assignedAdminId !== undefined) updateData.assignedAdminId = parsed.data.assignedAdminId;

      const [updated] = await db
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Audit log
      await auditSuccess(req, "ticket.update", "ticket", String(id), undefined, parsed.data);

      console.log(`[admin-tickets] Ticket ${id} updated by ${session.email}: ${JSON.stringify(parsed.data)}`);

      res.json({ ticket: updated });
    } catch (error: any) {
      await auditFailure(req, "ticket.update", "ticket", error.message, req.params.id);
      console.log(`[admin-tickets] Update ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  // Close ticket
  router.post("/tickets/:id/close", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const [updated] = await db
        .update(tickets)
        .set({
          status: "closed",
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Audit log
      await auditSuccess(req, "ticket.close", "ticket", String(id));

      console.log(`[admin-tickets] Ticket ${id} closed by ${session.email}`);

      res.json({ ticket: updated });
    } catch (error: any) {
      await auditFailure(req, "ticket.close", "ticket", error.message, req.params.id);
      console.log(`[admin-tickets] Close ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to close ticket" });
    }
  });

  // Reopen ticket
  router.post("/tickets/:id/reopen", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const [updated] = await db
        .update(tickets)
        .set({
          status: "open",
          closedAt: null,
          resolvedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Audit log
      await auditSuccess(req, "ticket.reopen", "ticket", String(id));

      console.log(`[admin-tickets] Ticket ${id} reopened by ${session.email}`);

      res.json({ ticket: updated });
    } catch (error: any) {
      await auditFailure(req, "ticket.reopen", "ticket", error.message, req.params.id);
      console.log(`[admin-tickets] Reopen ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to reopen ticket" });
    }
  });

  // Delete ticket
  router.delete("/tickets/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { confirm } = req.body;
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Must confirm deletion" });
      }

      // Delete messages first
      await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));

      // Delete ticket
      const deleted = await db.delete(tickets).where(eq(tickets.id, id)).returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Audit log
      await auditSuccess(req, "ticket.delete", "ticket", String(id));

      console.log(`[admin-tickets] Ticket ${id} deleted by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "ticket.delete", "ticket", error.message, req.params.id);
      console.log(`[admin-tickets] Delete ticket error: ${error.message}`);
      res.status(500).json({ error: "Failed to delete ticket" });
    }
  });
}
