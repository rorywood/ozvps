import { type PanelUser, type InsertPanelUser, type Session, panelUsers, sessions } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  getUserById(id: number): Promise<PanelUser | undefined>;
  getUserByEmail(email: string): Promise<PanelUser | undefined>;
  createUser(user: InsertPanelUser): Promise<PanelUser>;
  
  createSession(userId: number, expiresAt: Date): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: number): Promise<PanelUser | undefined> {
    const [user] = await db.select().from(panelUsers).where(eq(panelUsers.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<PanelUser | undefined> {
    const [user] = await db.select().from(panelUsers).where(eq(panelUsers.email, email.toLowerCase()));
    return user;
  }

  async createUser(insertUser: InsertPanelUser): Promise<PanelUser> {
    const [user] = await db.insert(panelUsers).values({
      ...insertUser,
      email: insertUser.email.toLowerCase(),
    }).returning();
    return user;
  }

  async createSession(userId: number, expiresAt: Date): Promise<Session> {
    const id = randomBytes(32).toString("hex");
    const [session] = await db.insert(sessions).values({
      id,
      userId,
      expiresAt,
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
}

export const storage = new DatabaseStorage();
