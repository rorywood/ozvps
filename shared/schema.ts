import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const panelUsers = pgTable("panel_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  extRelationId: text("ext_relation_id").notNull(),
  virtFusionUserId: integer("virtfusion_user_id"),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => panelUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPanelUserSchema = createInsertSchema(panelUsers).pick({
  email: true,
  passwordHash: true,
  extRelationId: true,
  virtFusionUserId: true,
  name: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type InsertPanelUser = z.infer<typeof insertPanelUserSchema>;
export type PanelUser = typeof panelUsers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
