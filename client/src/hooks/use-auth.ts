import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthSession {
  authenticated: boolean;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: session, isLoading } = useQuery<AuthSession>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
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
    isAuthenticated: session?.authenticated ?? false,
    isLoading,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
