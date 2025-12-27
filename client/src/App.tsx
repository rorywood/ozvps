import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ServerList from "@/pages/server-list";
import ServerDetail from "@/pages/server-detail";
import Networking from "@/pages/networking";
import Account from "@/pages/account";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/servers" component={ServerList} />
      <Route path="/server/:id" component={ServerDetail} />
      <Route path="/networking" component={Networking} />
      <Route path="/account" component={Account} />
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
