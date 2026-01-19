import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi, setCsrfToken } from "./api";

interface User {
  email: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  bootstrapMode: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean; pendingLoginToken?: string; requires2FASetup?: boolean; error?: string }>;
  verify2FA: (pendingLoginToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapMode, setBootstrapMode] = useState(false);

  const checkSession = async () => {
    try {
      const session = await authApi.getSession();
      if (session.authenticated && session.user) {
        setUser(session.user);
        if (session.csrfToken) {
          setCsrfToken(session.csrfToken);
        }
        setBootstrapMode(session.bootstrapMode || false);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    return result;
  };

  const verify2FA = async (pendingLoginToken: string, code: string) => {
    const result = await authApi.verify2FA(pendingLoginToken, code);
    if (result.success) {
      setUser(result.user);
      setCsrfToken(result.csrfToken);
      setBootstrapMode((result as any).bootstrapMode || false);
    }
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        bootstrapMode,
        login,
        verify2FA,
        logout,
        checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
