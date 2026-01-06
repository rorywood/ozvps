import { QueryClient, QueryFunction } from "@tanstack/react-query";

export interface SessionError {
  error: string;
  code?: string;
}

let sessionErrorCallback: ((error: SessionError) => void) | null = null;

export function setSessionErrorCallback(callback: (error: SessionError) => void) {
  sessionErrorCallback = callback;
}

async function handleResponse(res: Response): Promise<void> {
  if (!res.ok) {
    if (res.status === 401) {
      try {
        const errorData = await res.json();
        if (sessionErrorCallback && errorData.code) {
          sessionErrorCallback(errorData);
        }
        throw new Error(errorData.error || 'Authentication required');
      } catch (e) {
        if (e instanceof Error && e.message !== 'Authentication required') {
          throw new Error('Authentication required');
        }
        throw e;
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await handleResponse(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (res.status === 401) {
      try {
        const errorData = await res.json();
        if (sessionErrorCallback && errorData.code) {
          sessionErrorCallback(errorData);
        }
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        throw new Error(errorData.error || 'Authentication required');
      } catch (e) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        throw e;
      }
    }

    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }

    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
