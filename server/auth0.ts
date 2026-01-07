import { log } from "./index";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;

interface Auth0TokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

interface Auth0User {
  user_id: string;
  email: string;
  name?: string;
  email_verified?: boolean;
  app_metadata?: {
    virtfusion_user_id?: number;
  };
}

interface Auth0Error {
  error: string;
  error_description: string;
}

class Auth0Client {
  private baseUrl: string;
  private managementToken: string | null = null;
  private managementTokenExpiry: number = 0;
  private userExistsCache: Map<string, { exists: boolean; checkedAt: number }> = new Map();
  // SECURITY: Very short cache TTL to ensure deleted users are locked out quickly
  // Only cache "exists: false" longer since that's a permanent state
  private readonly USER_EXISTS_CACHE_TTL_MS = 30 * 1000; // 30 seconds for exists: true
  private readonly USER_NOT_EXISTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for exists: false

  constructor() {
    if (!AUTH0_DOMAIN) {
      throw new Error('AUTH0_DOMAIN is not configured');
    }
    this.baseUrl = `https://${AUTH0_DOMAIN}`;
  }

  private async getManagementToken(): Promise<string> {
    if (this.managementToken && Date.now() < this.managementTokenExpiry) {
      return this.managementToken;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: `${this.baseUrl}/api/v2/`,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as Auth0Error;
      log(`Failed to get Auth0 management token: ${error.error_description}`, 'auth0');
      throw new Error('Failed to get management token');
    }

    const data = await response.json() as Auth0TokenResponse;
    this.managementToken = data.access_token;
    this.managementTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.managementToken;
  }

  async authenticateUser(email: string, password: string): Promise<{ success: boolean; user?: Auth0User; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'password',
          username: email,
          password: password,
          client_id: AUTH0_CLIENT_ID,
          client_secret: AUTH0_CLIENT_SECRET,
          scope: 'openid profile email',
        }),
      });

      if (!response.ok) {
        const error = await response.json() as Auth0Error;
        log(`Auth0 login failed for ${email}: ${error.error_description}`, 'auth0');
        
        // Check if user is blocked FIRST (before other error checks)
        if (error.error_description?.toLowerCase().includes('block')) {
          return { success: false, error: 'Your account has been banned by Support. Please contact us at support@ozvps.com.au for further info.' };
        }
        
        if (error.error === 'invalid_grant') {
          return { success: false, error: 'Invalid email or password' };
        }
        return { success: false, error: error.error_description || 'Authentication failed' };
      }

      const tokenData = await response.json() as Auth0TokenResponse;
      
      const userInfoResponse = await fetch(`${this.baseUrl}/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoResponse.ok) {
        log(`Failed to get user info from Auth0`, 'auth0');
        return { success: false, error: 'Failed to get user information' };
      }

      const userInfo = await userInfoResponse.json() as any;
      
      return {
        success: true,
        user: {
          user_id: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name || userInfo.nickname,
          email_verified: userInfo.email_verified,
        },
      };
    } catch (error: any) {
      log(`Auth0 authentication error: ${error.message}`, 'auth0');
      return { success: false, error: 'Authentication service unavailable' };
    }
  }

  async createUser(email: string, password: string, name?: string): Promise<{ success: boolean; user?: Auth0User; error?: string }> {
    try {
      // Use the dbconnections/signup endpoint which doesn't require Management API access
      const response = await fetch(`${this.baseUrl}/dbconnections/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: AUTH0_CLIENT_ID,
          email,
          password,
          connection: 'Username-Password-Authentication',
          name: name || email.split('@')[0],
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        log(`Auth0 user creation failed for ${email}: ${JSON.stringify(error)}`, 'auth0');
        
        if (error.code === 'invalid_signup' || error.description?.includes('already exists')) {
          return { success: false, error: 'An account with this email already exists' };
        }
        if (error.code === 'password_strength_error' || error.name === 'PasswordStrengthError') {
          return { success: false, error: 'Password is too weak. Please use a stronger password.' };
        }
        return { success: false, error: error.description || error.message || 'Failed to create account' };
      }

      const userData = await response.json() as any;
      
      return {
        success: true,
        user: {
          user_id: userData._id || `auth0|${userData._id}`,
          email: userData.email,
          name: name || email.split('@')[0],
          email_verified: false,
        },
      };
    } catch (error: any) {
      log(`Auth0 user creation error: ${error.message}`, 'auth0');
      return { success: false, error: 'Account creation service unavailable' };
    }
  }

  async getUserByEmail(email: string): Promise<Auth0User | null> {
    try {
      const managementToken = await this.getManagementToken();

      const response = await fetch(
        `${this.baseUrl}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${managementToken}` },
        }
      );

      if (!response.ok) {
        log(`Failed to get Auth0 user by email: ${response.status}`, 'auth0');
        return null;
      }

      const users = await response.json() as any[];
      if (users.length === 0) {
        return null;
      }

      const user = users[0];
      return {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        app_metadata: user.app_metadata,
      };
    } catch (error: any) {
      log(`Auth0 get user error: ${error.message}`, 'auth0');
      return null;
    }
  }

  async getUserById(userId: string): Promise<Auth0User | null> {
    try {
      const managementToken = await this.getManagementToken();

      const response = await fetch(
        `${this.baseUrl}/api/v2/users/${encodeURIComponent(userId)}`,
        {
          headers: { Authorization: `Bearer ${managementToken}` },
        }
      );

      if (!response.ok) {
        log(`Failed to get Auth0 user by ID: ${response.status}`, 'auth0');
        return null;
      }

      const user = await response.json() as any;
      return {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        app_metadata: user.app_metadata,
      };
    } catch (error: any) {
      log(`Auth0 get user by ID error: ${error.message}`, 'auth0');
      return null;
    }
  }

  async setVirtFusionUserId(auth0UserId: string, virtFusionUserId: number | null): Promise<boolean> {
    try {
      const managementToken = await this.getManagementToken();

      const response = await fetch(
        `${this.baseUrl}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_metadata: {
              virtfusion_user_id: virtFusionUserId,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        log(`Failed to update Auth0 user metadata: ${response.status} ${error}`, 'auth0');
        return false;
      }

      if (virtFusionUserId === null) {
        log(`Cleared VirtFusion user ID from Auth0 metadata for user ${auth0UserId}`, 'auth0');
      } else {
        log(`Stored VirtFusion user ID ${virtFusionUserId} in Auth0 metadata for user ${auth0UserId}`, 'auth0');
      }
      return true;
    } catch (error: any) {
      log(`Auth0 metadata update error: ${error.message}`, 'auth0');
      return false;
    }
  }

  async getVirtFusionUserId(auth0UserId: string): Promise<number | null> {
    const user = await this.getUserById(auth0UserId);
    return user?.app_metadata?.virtfusion_user_id || null;
  }

  async isUserAdmin(auth0UserId: string): Promise<boolean> {
    const user = await this.getUserById(auth0UserId);
    return user?.app_metadata?.is_admin === true;
  }

  async userExists(auth0UserId: string): Promise<boolean> {
    // Check cache first with appropriate TTL based on existence state
    const cached = this.userExistsCache.get(auth0UserId);
    if (cached) {
      const ttl = cached.exists ? this.USER_EXISTS_CACHE_TTL_MS : this.USER_NOT_EXISTS_CACHE_TTL_MS;
      if (Date.now() - cached.checkedAt < ttl) {
        return cached.exists;
      }
    }

    try {
      const managementToken = await this.getManagementToken();

      const response = await fetch(
        `${this.baseUrl}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
        {
          headers: { Authorization: `Bearer ${managementToken}` },
        }
      );

      if (response.status === 404) {
        log(`Auth0 user ${auth0UserId} not found (deleted)`, 'auth0');
        this.userExistsCache.set(auth0UserId, { exists: false, checkedAt: Date.now() });
        return false;
      }

      if (!response.ok) {
        log(`Auth0 user existence check failed: ${response.status}`, 'auth0');
        // SECURITY: Fail closed - if we can't verify user exists, deny access
        // This prevents ghost sessions when Auth0 has issues
        return false;
      }

      this.userExistsCache.set(auth0UserId, { exists: true, checkedAt: Date.now() });
      return true;
    } catch (error: any) {
      log(`Auth0 user existence check error: ${error.message}`, 'auth0');
      // SECURITY: Fail closed - network errors should deny access
      // This is safer than allowing access to potentially deleted users
      return false;
    }
  }

  invalidateUserExistsCache(auth0UserId: string): void {
    this.userExistsCache.delete(auth0UserId);
  }

  async changePassword(auth0UserId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const managementToken = await this.getManagementToken();

      const response = await fetch(
        `${this.baseUrl}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            password: newPassword,
            connection: 'Username-Password-Authentication',
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json() as any;
        log(`Failed to change Auth0 password: ${response.status} ${JSON.stringify(error)}`, 'auth0');
        
        if (error.message?.includes('PasswordStrengthError') || error.code === 'password_strength_error') {
          return { success: false, error: 'Password is too weak. Please use a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.' };
        }
        if (error.message?.includes('PasswordHistoryError')) {
          return { success: false, error: 'Cannot reuse a recent password. Please choose a different password.' };
        }
        return { success: false, error: error.message || 'Failed to change password' };
      }

      log(`Password changed successfully for user ${auth0UserId}`, 'auth0');
      return { success: true };
    } catch (error: any) {
      log(`Auth0 password change error: ${error.message}`, 'auth0');
      return { success: false, error: 'Password change service unavailable' };
    }
  }
}

export const auth0Client = new Auth0Client();
