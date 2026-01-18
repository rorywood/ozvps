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
      return response.json();
    },
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: 1000 * 30, // Poll every 30 seconds
    retry: 1, // Only retry once on failure
  });

  const isHealthy = data?.status === 'ok';
  const isDatabaseDown = data?.errorCode === 'DB_UNAVAILABLE' || data?.services?.database === false;
  const isVirtFusionDown = data?.errorCode === 'VF_API_UNAVAILABLE' || data?.services?.virtfusion === false;

  return {
    health: data,
    isLoading,
    error,
    refetch,
    isHealthy,
    isDatabaseDown,
    isVirtFusionDown,
    errorMessage: data?.message,
    errorCode: data?.errorCode,
  };
}
