import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ServerCard } from "@/components/ui/server-card";
import { SkeletonServerGrid } from "@/components/ui/skeleton-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQuery } from "@tanstack/react-query";
import {
  Server as ServerIcon,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Zap
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useSyncPowerActions } from "@/hooks/use-power-actions";
import { useState } from "react";

export default function ServerList() {
  useDocumentTitle('Servers');
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: servers, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api.listServers(),
    refetchInterval: 1000, // 1 second refresh for real-time updates
  });

  useSyncPowerActions(servers);

  // Filter servers based on search query
  const filteredServers = servers?.filter(server => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      server.name?.toLowerCase().includes(query) ||
      server.primaryIp?.toLowerCase().includes(query) ||
      server.plan?.name?.toLowerCase().includes(query) ||
      server.location?.name?.toLowerCase().includes(query)
    );
  }) || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Servers"
          description="Manage your virtual private servers"
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search servers..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <SkeletonServerGrid count={6} />
        ) : isError ? (
          <Card padding="lg" className="flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Servers</h3>
            <p className="text-muted-foreground max-w-md">
              Unable to fetch servers. Please try again later.
            </p>
          </Card>
        ) : filteredServers.length === 0 ? (
          <Card padding="lg" className="flex flex-col items-center justify-center text-center" data-testid="empty-servers-state">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <ServerIcon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {searchQuery ? 'No Matching Servers' : 'No Servers Yet'}
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              {searchQuery
                ? `No servers match "${searchQuery}". Try a different search term.`
                : "You don't have any VPS servers yet. Deploy a server to get started."
              }
            </p>
            {!searchQuery && (
              <Button variant="outline" data-testid="button-order-server" asChild>
                <Link href="/deploy">
                  <Zap className="h-4 w-4 mr-2" />
                  Deploy a Server
                </Link>
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onClick={() => setLocation(`/servers/${server.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
