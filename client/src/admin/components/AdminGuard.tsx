import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'hsl(219, 95%, 5%)' }}>
        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return <Redirect to="/login" />;
  }

  if (!auth.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
