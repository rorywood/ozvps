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

export type Session = typeof sessions.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
