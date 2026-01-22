import { useQuery } from "@tanstack/react-query";

interface SystemHealth {
  status: 'ok' | 'error';
  errorCode?: 'DB_UNAVAILABLE' | 'VF_API_UNAVAILABLE' | 'SYSTEM_ERROR';
  message?: string;
  services?: {
    database: boolean | null;
    virtfusion: boolean | null;
  };
}

export function useSystemHealth() {
  const { data, isLoading, error, refetch } = useQuery<SystemHealth>({
    queryKey: ["system", "health"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/health", {
          // Short timeout - if API is down, fail fast
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          // Non-2xx response - parse error if possible
          try {
            return await response.json();
          } catch {
            // Couldn't parse JSON, treat as system error
            return {
              status: 'error' as const,
              errorCode: 'SYSTEM_ERROR' as const,
              message: 'System is temporarily unavailable',
              services: { database: false, virtfusion: null }
            };
          }
        }
        return await response.json();
      } catch (e) {
        // Network error, timeout, or API completely unreachable
        // Return error object instead of throwing so we can detect it
        return {
          status: 'error' as const,
          errorCode: 'SYSTEM_ERROR' as const,
          message: 'Unable to connect to server',
          services: { database: false, virtfusion: null }
        };
      }
    },
    staleTime: 1000 * 5, // 5 seconds - check more frequently
    refetchInterval: 1000 * 10, // Poll every 10 seconds when API might be down
    retry: 0, // Don't retry - fail fast
  });

  const isHealthy = data?.status === 'ok';

  // Database is down
  const isDatabaseDown =
    data?.errorCode === 'DB_UNAVAILABLE' ||
    data?.services?.database === false;

  // VirtFusion is down
  const isVirtFusionDown =
    data?.errorCode === 'VF_API_UNAVAILABLE' ||
    data?.services?.virtfusion === false;

  // System is unavailable if ANY critical service is down
  // This should block login/registration
  const isSystemDown =
    data?.status === 'error' ||  // Any error status
    isDatabaseDown ||
    isVirtFusionDown ||
    data?.errorCode === 'SYSTEM_ERROR' ||
    (error !== null && !isLoading); // Health check failed completely

  return {
    health: data,
    isLoading,
    error,
    refetch,
    isHealthy,
    isDatabaseDown,
    isVirtFusionDown,
    isSystemDown,  // Use this to block login - covers ALL failure scenarios
    errorMessage: data?.message || (error ? 'System is temporarily unavailable' : undefined),
    errorCode: data?.errorCode || (error ? 'SYSTEM_ERROR' : undefined),
  };
}
