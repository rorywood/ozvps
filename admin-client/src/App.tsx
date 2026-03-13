import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Servers from "./pages/Servers";
import ProvisionServer from "./pages/ProvisionServer";
import Billing from "./pages/Billing";
import Tickets from "./pages/Tickets";
import Health from "./pages/Health";
import Logs from "./pages/Logs";
import Whitelist from "./pages/Whitelist";
import PromoCodes from "./pages/PromoCodes";
import Security from "./pages/Security";
import Deletions from "./pages/Deletions";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(216_33%_6%)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(210_100%_50%)]"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(216_33%_6%)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(210_100%_50%)]"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="servers" element={<Servers />} />
        <Route path="servers/provision" element={<ProvisionServer />} />
        <Route path="billing" element={<Billing />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="health" element={<Health />} />
        <Route path="logs" element={<Logs />} />
        <Route path="whitelist" element={<Whitelist />} />
        <Route path="promo-codes" element={<PromoCodes />} />
        <Route path="security" element={<Security />} />
        <Route path="deletions" element={<Deletions />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
