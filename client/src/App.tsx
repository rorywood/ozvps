import React, { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setSessionErrorCallback, SessionError } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PowerActionProvider } from "@/hooks/use-power-actions";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ServerList from "@/pages/server-list";
import ServerDetail from "@/pages/server-detail";
import ServerConsole from "@/pages/server-console";
import Account from "@/pages/account";
import Order from "@/pages/order";
import Pricing from "@/pages/pricing";
import Deploy from "@/pages/deploy";
import DeployConfigure from "@/pages/deploy-configure";
import Login from "@/pages/login";
import SystemError from "@/pages/system-error";
import Admin from "@/pages/admin";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

function SystemHealthCheck({ children }: { children: React.ReactNode }) {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.checkHealth(),
    retry: 2,
    retryDelay: 1000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (health?.status === 'error') {
    return <SystemError errorCode={health.errorCode} onRetry={() => refetch()} />;
  }

  return <>{children}</>;
}

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
      <Route path="/pricing">
        <Pricing />
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
      <Route path="/servers/:id/console">
        {(params) => (
          <AuthGuard>
            <ServerConsole />
          </AuthGuard>
        )}
      </Route>
      <Route path="/account">
        <AuthGuard>
          <Account />
        </AuthGuard>
      </Route>
      <Route path="/admin">
        <AuthGuard>
          <Admin />
        </AuthGuard>
      </Route>
      <Route path="/order">
        <AuthGuard>
          <Order />
        </AuthGuard>
      </Route>
      <Route path="/deploy">
        <AuthGuard>
          <Deploy />
        </AuthGuard>
      </Route>
      <Route path="/deploy/:planId">
        {(params) => (
          <AuthGuard>
            <DeployConfigure />
          </AuthGuard>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function SessionErrorHandler() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setSessionErrorCallback((error: SessionError) => {
      if (error.code) {
        sessionStorage.setItem('sessionError', JSON.stringify(error));
        queryClient.clear();
        setLocation('/login');
      }
    });
    
    return () => setSessionErrorCallback(() => {});
  }, [setLocation]);
  
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PowerActionProvider>
        <TooltipProvider>
          <Toaster />
          <SessionErrorHandler />
          <SystemHealthCheck>
            <Router />
          </SystemHealthCheck>
        </TooltipProvider>
      </PowerActionProvider>
    </QueryClientProvider>
  );
}

export default App;
