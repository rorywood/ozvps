import React from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ServerList from "@/pages/server-list";
import ServerDetail from "@/pages/server-detail";
import Account from "@/pages/account";
import Login from "@/pages/login";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  
  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
    staleTime: 0, // Always refetch on navigation for security
  });

  React.useEffect(() => {
    if (!isLoading && !auth) {
      setLocation('/login');
    }
  }, [isLoading, auth, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
    staleTime: 0,
  });

  return (
    <Switch>
      <Route path="/login">
        {auth ? <Redirect to="/dashboard" /> : <Login />}
      </Route>
      <Route path="/">
        <AuthGuard>
          <Redirect to="/dashboard" />
        </AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard>
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route path="/servers">
        <AuthGuard>
          <ServerList />
        </AuthGuard>
      </Route>
      <Route path="/servers/:id">
        {(params) => (
          <AuthGuard>
            <ServerDetail />
          </AuthGuard>
        )}
      </Route>
      <Route path="/account">
        <AuthGuard>
          <Account />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
