import { type Session, type User, sessions, users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

export interface IStorage {
  createUser(data: { email: string; password: string; name?: string; virtFusionUserId?: number; extRelationId?: string }): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  updateUserVirtFusionData(userId: number, data: { virtFusionUserId: number; extRelationId: string; name?: string }): Promise<void>;
  updateUser(userId: number, data: { name?: string }): Promise<void>;
  updateUserPassword(userId: number, newPassword: string): Promise<void>;
  updateUserStatus(userId: number, status: 'active' | 'disabled'): Promise<void>;
  verifyPassword(user: User, password: string): Promise<boolean>;
  
  createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    expiresAt: Date;
  }): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;
  deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createUser(data: { email: string; password: string; name?: string; virtFusionUserId?: number; extRelationId?: string }): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const [user] = await db.insert(users).values({
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      virtFusionUserId: data.virtFusionUserId,
      extRelationId: data.extRelationId,
    }).returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserVirtFusionData(userId: number, data: { virtFusionUserId: number; extRelationId: string; name?: string }): Promise<void> {
    await db.update(users).set({
      virtFusionUserId: data.virtFusionUserId,
      extRelationId: data.extRelationId,
      name: data.name || undefined,
    }).where(eq(users.id, userId));
  }

  async updateUser(userId: number, data: { name?: string }): Promise<void> {
    await db.update(users).set(data).where(eq(users.id, userId));
  }

  async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  async updateUserStatus(userId: number, status: 'active' | 'disabled'): Promise<void> {
    await db.update(users).set({ status }).where(eq(users.id, userId));
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    expiresAt: Date;
  }): Promise<Session> {
    const id = randomBytes(32).toString("hex");
    const [session] = await db.insert(sessions).values({
      id,
      userId: data.visitorId,
      auth0UserId: data.auth0UserId,
      virtFusionUserId: data.virtFusionUserId,
      extRelationId: data.extRelationId,
      email: data.email,
      name: data.name,
      expiresAt: data.expiresAt,
    }).returning();
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteUserSessions(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.auth0UserId, auth0UserId));
  }
}

export const storage = new DatabaseStorage();
