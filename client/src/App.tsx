import React, { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, setSessionErrorCallback, SessionError } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PowerActionProvider } from "@/hooks/use-power-actions";
import { ThemeProvider } from "@/components/theme-provider";
import { DevBanner } from "@/components/dev-banner";
import NotFound from "@/pages/not-found";
import ErrorPage from "@/pages/error";
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
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";
import Billing from "@/pages/billing";
import Support from "@/pages/support";
import SupportTicket from "@/pages/support-ticket";
import GuestTicket from "@/pages/guest-ticket";
import { api, setApiSessionErrorCallback } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { useSystemHealth } from "@/hooks/use-system-health";

// Public routes that handle their own DB error UI or don't require auth
const PUBLIC_AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/pricing', '/verify-email', '/support/guest'];

function SystemHealthCheck({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isDatabaseDown } = useSystemHealth();

  // Check if we're on a public auth route (they have their own error handling)
  const isPublicAuthRoute = PUBLIC_AUTH_ROUTES.some(route => location.startsWith(route));

  // If DB is down and we're NOT on a public auth route, redirect to login
  // The login page has its own UI for displaying the system unavailable message
  useEffect(() => {
    if (isDatabaseDown && !isPublicAuthRoute) {
      // Clear any cached auth state and redirect to login
      queryClient.clear();
      window.location.href = '/login';
    }
  }, [isDatabaseDown, isPublicAuthRoute]);

  // Show nothing while redirecting
  if (isDatabaseDown && !isPublicAuthRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function AuthGuard({ children, requireVerified = true }: { children: React.ReactNode; requireVerified?: boolean }) {
  const [location] = useLocation();
  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
    staleTime: 0, // Always refetch on navigation for security
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return <Redirect to="/login" />;
  }

  // Redirect unverified users to verify-email page (unless already there or verification not required)
  if (requireVerified && auth.emailVerified === false && location !== '/verify-email') {
    return <Redirect to="/verify-email" />;
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
      <Route path="/register">
        {auth ? <Redirect to="/dashboard" /> : <Register />}
      </Route>
      <Route path="/forgot-password">
        {auth ? <Redirect to="/dashboard" /> : <ForgotPassword />}
      </Route>
      <Route path="/reset-password">
        {auth ? <Redirect to="/dashboard" /> : <ResetPassword />}
      </Route>
      <Route path="/verify-email">
        <VerifyEmail />
      </Route>
      <Route path="/support/guest/:accessToken">
        <GuestTicket />
      </Route>
      <Route path="/pricing">
        <Pricing />
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
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
      <Route path="/billing">
        <AuthGuard>
          <Billing />
        </AuthGuard>
      </Route>
      <Route path="/support/:id">
        {(params) => (
          <AuthGuard>
            <SupportTicket />
          </AuthGuard>
        )}
      </Route>
      <Route path="/support">
        <AuthGuard>
          <Support />
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
      <Route path="/error/:code">
        <ErrorPage />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function SessionTimeoutHandler() {
  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
    staleTime: 0,
  });

  // Only track activity for authenticated users
  useSessionTimeout();

  return null;
}

function SessionErrorHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleSessionError = (error: SessionError) => {
      // Always redirect to login on any 401 error (e.g., when PM2 restarts or session expires)
      sessionStorage.setItem('sessionError', JSON.stringify(error));
      queryClient.clear();
      // Use window.location for clean redirect that resets all state
      window.location.href = '/login';
    };

    // Set callback for both query client and API client
    setSessionErrorCallback(handleSessionError);
    setApiSessionErrorCallback(handleSessionError);

    return () => {
      setSessionErrorCallback(() => {});
      setApiSessionErrorCallback(() => {});
    };
  }, [setLocation]);

  return null;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <PowerActionProvider>
          <TooltipProvider>
            <DevBanner />
            <Toaster />
            <SonnerToaster />
            <SessionTimeoutHandler />
            <SessionErrorHandler />
            <SystemHealthCheck>
              <Router />
            </SystemHealthCheck>
          </TooltipProvider>
        </PowerActionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
