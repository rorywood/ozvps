import { useQuery } from "@tanstack/react-query";

interface SystemHealth {
  status: 'ok' | 'error';
  errorCode?: 'DB_UNAVAILABLE' | 'VF_API_UNAVAILABLE' | 'SYSTEM_ERROR' | 'RATE_LIMITED';
  message?: string;
  maintenanceMode?: boolean;
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

        // Handle rate limiting - this is NOT a system error, just user hitting limits
        if (response.status === 429) {
          return {
            status: 'error' as const,
            errorCode: 'RATE_LIMITED' as const,
            message: 'You have been rate limited. Please wait a moment.',
            services: { database: true, virtfusion: true } // Services are fine, just rate limited
          };
        }

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

  // Rate limited - user hit request limits (not a system problem)
  const isRateLimited = data?.errorCode === 'RATE_LIMITED';

  // System is unavailable if ANY critical service is down
  // This should block login/registration
  // Note: Rate limiting is NOT a system error - user just needs to wait
  const isSystemDown =
    (data?.status === 'error' && !isRateLimited) ||  // Error status (except rate limit)
    isDatabaseDown ||
    isVirtFusionDown ||
    data?.errorCode === 'SYSTEM_ERROR' ||
    (error !== null && !isLoading && !isRateLimited); // Health check failed completely

  const isMaintenanceMode = data?.maintenanceMode === true;

  return {
    health: data,
    isLoading,
    error,
    refetch,
    isHealthy,
    isDatabaseDown,
    isVirtFusionDown,
    isRateLimited,  // User hit rate limits - not a system problem
    isSystemDown,  // Use this to block login - covers ALL failure scenarios
    isMaintenanceMode,
    errorMessage: data?.message || (error ? 'System is temporarily unavailable' : undefined),
    errorCode: data?.errorCode || (error ? 'SYSTEM_ERROR' : undefined),
  };
}
