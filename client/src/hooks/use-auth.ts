import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { triggerRateLimit, isRateLimited } from "@/components/rate-limit-overlay";

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
}

interface AuthMeResponse {
  user: User;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const rateLimited = isRateLimited();

  const { data: session, isLoading: sessionLoading } = useQuery<AuthSession>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session");
      // If rate limited, show overlay and preserve previous state
      if (response.status === 429) {
        try {
          const data = await response.clone().json();
          triggerRateLimit(data.blockSeconds || 10);
        } catch {
          triggerRateLimit(10);
        }
        throw new Error("Rate limited - slow down");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    enabled: !rateLimited, // Don't fetch while rate limited
    retry: (failureCount, error) => {
      // Don't retry if rate limited
      if (error?.message?.includes("Rate limited")) return false;
      return failureCount < 2;
    },
  });

  // Fetch full user data including emailVerified
  const { data: meData, isLoading: meLoading } = useQuery<AuthMeResponse>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me");
      // If rate limited, show overlay and preserve previous state
      if (response.status === 429) {
        try {
          const data = await response.clone().json();
          triggerRateLimit(data.blockSeconds || 10);
        } catch {
          triggerRateLimit(10);
        }
        throw new Error("Rate limited - slow down");
      }
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !rateLimited && (session?.authenticated ?? false),
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
