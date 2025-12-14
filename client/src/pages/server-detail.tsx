import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Power, 
  RotateCw, 
  TerminalSquare, 
  Cpu, 
  HardDrive, 
  Network, 
  Clock,
  Settings,
  Shield,
  Activity,
  HardDrive as StorageIcon,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// Mock historical data for charts
const generateHistoryData = (points: number, base: number, variance: number) => {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}:00`,
    value: Math.max(0, Math.min(100, base + (Math.random() * variance * 2 - variance)))
  }));
};

const cpuData = generateHistoryData(24, 45, 15);
const ramData = generateHistoryData(24, 60, 5);
const netData = generateHistoryData(24, 20, 10);

export default function ServerDetail() {
  const [, params] = useRoute("/server/:id");
  const serverId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.getServer(serverId || ''),
    enabled: !!serverId
  });

  const powerMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'boot' | 'reboot' | 'shutdown' }) => 
      api.powerAction(id, action),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({
        title: "Action Initiated",
        description: `Server ${action} command sent successfully.`,
      });
    }
  });

  const handlePowerAction = (action: 'boot' | 'reboot' | 'shutdown') => {
    if (serverId) {
      powerMutation.mutate({ id: serverId, action });
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
          <p>Loading server details...</p>
        </div>
      </AppShell>
    );
  }

  if (isError || !server) {
    return (
      <AppShell>
         <div className="flex flex-col items-center justify-center py-20 text-red-400 h-[50vh]">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p>Server not found or access denied.</p>
            <Link href="/servers">
              <Button variant="outline" className="mt-4 border-white/10 text-white">Return to Fleet</Button>
            </Link>
          </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 pb-20">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Link href="/servers">
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-white hover:bg-white/5">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-white">{server.name}</h1>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                  server.status === 'running' ? "bg-green-500/10 border-green-500/20 text-green-400" : 
                  server.status === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                  "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                )}>
                  {server.status}
                </span>
              </div>
              <p className="text-muted-foreground font-mono text-sm mt-1">{server.id} • {server.primaryIp} • {server.location.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-white/10 hover:bg-white/5 hover:text-white text-muted-foreground gap-2">
              <TerminalSquare className="h-4 w-4" />
              Console
            </Button>
             <div className="w-px h-8 bg-white/10 mx-2 hidden lg:block" />
            <div className="flex items-center bg-black/20 rounded-md border border-white/10 p-1">
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-3 text-muted-foreground hover:text-green-400 hover:bg-green-400/10 rounded-sm gap-2" 
                title="Start"
                disabled={server.status === 'running' || powerMutation.isPending}
                onClick={() => handlePowerAction('boot')}
              >
                <Power className="h-4 w-4" />
                <span className="sr-only lg:not-sr-only">Start</span>
              </Button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-3 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 rounded-sm gap-2" 
                title="Reboot"
                disabled={server.status !== 'running' || powerMutation.isPending}
                onClick={() => handlePowerAction('reboot')}
              >
                <RotateCw className="h-4 w-4" />
                <span className="sr-only lg:not-sr-only">Reboot</span>
              </Button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-3 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-sm gap-2" 
                title="Stop"
                disabled={server.status === 'stopped' || powerMutation.isPending}
                onClick={() => handlePowerAction('shutdown')}
              >
                <Power className="h-4 w-4 rotate-180" />
                <span className="sr-only lg:not-sr-only">Stop</span>
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="bg-white/5 border border-white/5 p-1 h-auto w-full md:w-auto flex flex-wrap justify-start">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6">Overview</TabsTrigger>
            <TabsTrigger value="network" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6">Network</TabsTrigger>
            <TabsTrigger value="storage" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6">Storage</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <GlassCard className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">vCPU Usage</p>
                  <p className="text-xl font-bold text-white font-mono">{server.stats.cpu_usage}%</p>
                </div>
              </GlassCard>
              <GlassCard className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">RAM Usage</p>
                  <p className="text-xl font-bold text-white font-mono">{server.stats.ram_usage}%</p>
                </div>
              </GlassCard>
               <GlassCard className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <StorageIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Disk I/O</p>
                  <p className="text-xl font-bold text-white font-mono">{server.stats.disk_usage} MB/s</p>
                </div>
              </GlassCard>
               <GlassCard className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                  <Network className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Network</p>
                  <p className="text-xl font-bold text-white font-mono">{server.stats.net_in} Mb/s</p>
                </div>
              </GlassCard>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-blue-500" />
                  CPU History (24h)
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuData}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <Network className="h-5 w-5 text-green-500" />
                  Network Throughput
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={netData}>
                      <defs>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorNet)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Hardware Information</h3>
                <div className="space-y-3 text-sm">
                   <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-white font-medium">{server.plan.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Operating System</span>
                    <span className="text-white font-medium">{server.image.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Virtualization</span>
                    <span className="text-white font-medium">KVM / VirtFusion</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Boot Mode</span>
                    <span className="text-white font-medium">UEFI</span>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                 <h3 className="text-lg font-semibold text-white mb-4">Recent Events</h3>
                 <div className="space-y-4">
                   {[
                     { event: "Daily Backup Created", time: "3 hours ago", type: "success" },
                     { event: "Network Interface Up", time: "2 days ago", type: "info" },
                     { event: "System Reboot (User Initiated)", time: "2 days ago", type: "warning" },
                   ].map((log, i) => (
                     <div key={i} className="flex items-start gap-3">
                       <div className={cn(
                         "mt-1 h-2 w-2 rounded-full",
                         log.type === 'success' ? "bg-green-500" :
                         log.type === 'warning' ? "bg-orange-500" : "bg-blue-500"
                       )} />
                       <div>
                         <p className="text-sm font-medium text-white">{log.event}</p>
                         <p className="text-xs text-muted-foreground">{log.time}</p>
                       </div>
                     </div>
                   ))}
                 </div>
              </GlassCard>
            </div>
          </TabsContent>

          <TabsContent value="network">
            <GlassCard className="p-6 text-center py-20">
              <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white">Network Configuration</h3>
              <p className="text-muted-foreground">Network interface management would go here.</p>
            </GlassCard>
          </TabsContent>
          
          <TabsContent value="storage">
            <GlassCard className="p-6 text-center py-20">
              <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white">Storage Volumes</h3>
              <p className="text-muted-foreground">Disk management and backups would go here.</p>
            </GlassCard>
          </TabsContent>

          <TabsContent value="settings">
            <GlassCard className="p-6 text-center py-20">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white">Server Settings</h3>
              <p className="text-muted-foreground">Reinstallation, ISO mounting, and kernel settings.</p>
            </GlassCard>
          </TabsContent>

        </Tabs>
      </div>
    </AppShell>
  );
}
