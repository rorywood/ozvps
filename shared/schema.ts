import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  virtFusionUserId: integer("virtfusion_user_id").notNull(),
  extRelationId: text("ext_relation_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  virtFusionToken: text("virtfusion_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const serverNameSchema = z.object({
  name: z.string()
    .min(2, 'Server name must be at least 2 characters')
    .max(48, 'Server name must be 48 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/, 'Server name can only contain letters, numbers, spaces, hyphens, underscores, and periods'),
});

export type Session = typeof sessions.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type ServerNameInput = z.infer<typeof serverNameSchema>;
