import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

// Maps Auth0 users to VirtFusion users
export const userMappings = pgTable("user_mappings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  virtFusionUserId: integer("virtfusion_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Legacy users table (no longer used with Auth0)
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  virtFusionUserId: integer("virtfusion_user_id"),
  extRelationId: text("ext_relation_id"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: integer("user_id"),
  auth0UserId: text("auth0_user_id"),
  virtFusionUserId: integer("virtfusion_user_id"),
  extRelationId: text("ext_relation_id"),
  email: text("email").notNull(),
  name: text("name"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
});

export const serverNameSchema = z.object({
  name: z.string()
    .min(2, 'Server name must be at least 2 characters')
    .max(48, 'Server name must be 48 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/, 'Server name can only contain letters, numbers, spaces, hyphens, underscores, and periods'),
});

export const hostnameSchema = z.string()
  .min(1, 'Hostname is required')
  .max(63, 'Hostname must be 63 characters or less')
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Hostname must be lowercase, start and end with a letter or number, and contain only letters, numbers, and hyphens')
  .transform(val => val.toLowerCase().trim());

export const reinstallSchema = z.object({
  osId: z.union([z.string(), z.number()]).refine(val => val !== '' && val !== null, 'OS template is required'),
  hostname: hostnameSchema,
});

// SSH Key schema for validation
export const sshKeySchema = z.object({
  name: z.string().min(1, 'Key name is required').max(100, 'Key name must be 100 characters or less'),
  publicKey: z.string()
    .min(1, 'Public key is required')
    .refine(val => {
      // Validate SSH public key format
      const keyTypes = ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss'];
      return keyTypes.some(type => val.startsWith(type + ' '));
    }, 'Invalid SSH public key format. Key must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-*'),
});

// SSH Key type for frontend/backend
export interface SshKey {
  id: number;
  name: string;
  publicKey: string;
  fingerprint?: string;
  createdAt?: string;
}

// Reinstall schema with optional SSH keys
export const reinstallWithSshSchema = z.object({
  osId: z.union([z.string(), z.number()]).refine(val => val !== '' && val !== null, 'OS template is required'),
  hostname: hostnameSchema,
  sshKeyIds: z.array(z.number()).optional(),
});

export type User = typeof users.$inferSelect;
export type UserMapping = typeof userMappings.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ServerNameInput = z.infer<typeof serverNameSchema>;
export type SshKeyInput = z.infer<typeof sshKeySchema>;
export type ReinstallWithSshInput = z.infer<typeof reinstallWithSshSchema>;
