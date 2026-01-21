import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthSession {
  authenticated: boolean;
}

interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
  virtFusionUserId?: number;
  extRelationId?: string;
  // Blocked = cannot log in at all (will be logged out)
  accountBlocked?: boolean;
  accountBlockedReason?: string | null;
  // Suspended = can log in but cannot deploy or control servers
  accountSuspended?: boolean;
  accountSuspendedReason?: string | null;
}

interface AuthMeResponse {
  user: User;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: session, isLoading: sessionLoading } = useQuery<AuthSession>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  // Fetch full user data including emailVerified
  const { data: meData, isLoading: meLoading } = useQuery<AuthMeResponse>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me");
      if (!response.ok) return null;
      return response.json();
    },
    enabled: session?.authenticated ?? false,
    staleTime: 1000 * 30, // 30 seconds
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      return response.json();
    },
    onSuccess: () => {
      // Set auth to null first to prevent refetch loops
      queryClient.setQueryData(['auth'], null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'session'], null);
      queryClient.clear();
      // Use window.location for a clean redirect that resets React state
      window.location.href = '/login';
    },
  });

  return {
    user: meData?.user ?? null,
    isAuthenticated: session?.authenticated ?? false,
    isLoading: sessionLoading || meLoading,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
