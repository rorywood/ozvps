import { type Session, sessions } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  createSession(data: {
    virtFusionUserId: number;
    extRelationId: string;
    email: string;
    name?: string;
    virtFusionToken: string;
    expiresAt: Date;
  }): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(virtFusionUserId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createSession(data: {
    virtFusionUserId: number;
    extRelationId: string;
    email: string;
    name?: string;
    virtFusionToken: string;
    expiresAt: Date;
  }): Promise<Session> {
    const id = randomBytes(32).toString("hex");
    const [session] = await db.insert(sessions).values({
      id,
      ...data,
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

  async deleteUserSessions(virtFusionUserId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.virtFusionUserId, virtFusionUserId));
  }
}

export const storage = new DatabaseStorage();
