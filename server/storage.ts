import { randomBytes } from "crypto";
import { SessionRevokeReason } from "@shared/schema";

export interface Session {
  id: string;
  userId?: number | null;
  auth0UserId?: string | null;
  virtFusionUserId?: number | null;
  extRelationId?: string | null;
  email: string;
  name?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
}

export interface UserFlags {
  auth0UserId: string;
  blocked: boolean;
  blockedReason?: string | null;
  blockedAt?: Date | null;
}

export interface IStorage {
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
  revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason): Promise<void>;
  getUserFlags(auth0UserId: string): Promise<UserFlags | undefined>;
  setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void>;
}

export class MemoryStorage implements IStorage {
  private sessions: Map<string, Session> = new Map();
  private userFlagsMap: Map<string, UserFlags> = new Map();

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
    const session: Session = {
      id,
      userId: data.visitorId || null,
      auth0UserId: data.auth0UserId || null,
      virtFusionUserId: data.virtFusionUserId || null,
      extRelationId: data.extRelationId || null,
      email: data.email,
      name: data.name || null,
      expiresAt: data.expiresAt,
      revokedAt: null,
      revokedReason: null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    if (new Date(session.expiresAt) < new Date()) {
      this.sessions.delete(id);
      return undefined;
    }
    
    if (session.revokedAt) {
      return session;
    }
    
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: number): Promise<void> {
    const idsToDelete: string[] = [];
    this.sessions.forEach((session, id) => {
      if (session.userId === userId) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.sessions.delete(id));
  }

  async deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void> {
    const idsToDelete: string[] = [];
    this.sessions.forEach((session, id) => {
      if (session.auth0UserId === auth0UserId) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.sessions.delete(id));
  }

  async revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason): Promise<void> {
    this.sessions.forEach((session) => {
      if (session.auth0UserId === auth0UserId && !session.revokedAt) {
        session.revokedAt = new Date();
        session.revokedReason = reason;
      }
    });
  }

  async getUserFlags(auth0UserId: string): Promise<UserFlags | undefined> {
    return this.userFlagsMap.get(auth0UserId);
  }

  async setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void> {
    const existing = this.userFlagsMap.get(auth0UserId);
    if (existing) {
      existing.blocked = blocked;
      existing.blockedReason = blocked ? (reason || null) : null;
      existing.blockedAt = blocked ? new Date() : null;
    } else {
      this.userFlagsMap.set(auth0UserId, {
        auth0UserId,
        blocked,
        blockedReason: blocked ? (reason || null) : null,
        blockedAt: blocked ? new Date() : null,
      });
    }
  }
}

export const storage = new MemoryStorage();
