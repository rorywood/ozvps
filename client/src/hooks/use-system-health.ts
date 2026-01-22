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
      const response = await fetch("/api/health");
      if (!response.ok) {
        // Non-2xx response - parse error if possible
        try {
          return response.json();
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
      return response.json();
    },
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: 1000 * 30, // Poll every 30 seconds
    retry: 1, // Only retry once on failure
  });

  const isHealthy = data?.status === 'ok';

  // System is down if:
  // 1. Database explicitly marked as down
  // 2. Health check failed entirely (error from react-query)
  // 3. System error returned
  const isDatabaseDown =
    data?.errorCode === 'DB_UNAVAILABLE' ||
    data?.errorCode === 'SYSTEM_ERROR' ||
    data?.services?.database === false ||
    (error !== null && !isLoading); // Health check failed completely

  const isVirtFusionDown = data?.errorCode === 'VF_API_UNAVAILABLE' || data?.services?.virtfusion === false;

  return {
    health: data,
    isLoading,
    error,
    refetch,
    isHealthy,
    isDatabaseDown,
    isVirtFusionDown,
    errorMessage: data?.message || (error ? 'System is temporarily unavailable' : undefined),
    errorCode: data?.errorCode || (error ? 'SYSTEM_ERROR' : undefined),
  };
}
