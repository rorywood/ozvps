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
  Settings,
  Activity,
  HardDrive as StorageIcon,
  Loader2,
  AlertCircle,
  Server as ServerIcon,
  User,
  Globe,
  AlignLeft,
  ChevronDown,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Home
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock historical data for charts
const generateHistoryData = (points: number, base: number, variance: number) => {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}:00`,
    value: Math.max(0, Math.min(100, base + (Math.random() * variance * 2 - variance)))
  }));
};

const cpuData = generateHistoryData(24, 45, 15);
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
      <div className="space-y-6 pb-20">
        
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <Link href="/servers">
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 text-muted-foreground hover:text-white hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-display font-bold text-white tracking-tight">{server.name}</h1>
              <div className={cn(
                "h-2.5 w-2.5 rounded-full shadow-[0_0_8px]",
                server.status === 'running' ? "bg-green-500 shadow-green-500/50" : 
                server.status === 'stopped' ? "bg-red-500 shadow-red-500/50" :
                "bg-yellow-500 shadow-yellow-500/50"
              )} />
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono text-white border border-white/10">IP</div>
                <span className="text-white/80 font-mono">{server.primaryIp}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                <span className="text-white/80">{server.id}.ozvps.com.au</span>
              </div>
              <div className="flex items-center gap-2">
                <AlignLeft className="h-3.5 w-3.5" />
                <span className="text-white/80">Production Web Server</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                <span className="text-white/80">Admin (Root)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" className="bg-white/5 hover:bg-white/10 text-white border-white/10 shadow-none font-medium h-9">
              <TerminalSquare className="h-4 w-4 mr-2 text-muted-foreground" />
              Console
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium h-9 shadow-[0_0_15px_rgba(37,99,235,0.3)] border-0">
                  <Power className="h-4 w-4 mr-2" />
                  Power Options
                  <ChevronDown className="h-3 w-3 ml-2 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[#0a0a0a]/95 backdrop-blur-xl border-white/10 text-white">
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-green-400 focus:text-green-400"
                    disabled={server.status === 'running'}
                    onClick={() => handlePowerAction('boot')}
                  >
                   <Power className="h-4 w-4 mr-2" /> Start Server
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-yellow-400 focus:text-yellow-400"
                    disabled={server.status !== 'running'}
                    onClick={() => handlePowerAction('reboot')}
                  >
                   <RotateCw className="h-4 w-4 mr-2" /> Reboot
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-red-400 focus:text-red-400"
                    disabled={server.status === 'stopped'}
                    onClick={() => handlePowerAction('shutdown')}
                  >
                   <Power className="h-4 w-4 mr-2 rotate-180" /> Shutdown
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Specs Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-4 bg-white/[0.02] border-white/5">
             <div className="flex items-center gap-4 mb-3">
               <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                  <Cpu className="h-5 w-5" />
               </div>
               <div className="flex-1">
                  <div className="text-sm font-bold text-white">{server.plan.specs.vcpu} vCore @ 3.5GHz</div>
                  <div className="text-xs text-muted-foreground">AMD EPYC 7003</div>
               </div>
             </div>
             <div className="space-y-1.5">
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">CPU Usage</span>
                 <span className="text-white font-medium">{server.stats?.cpu_usage || 0}%</span>
               </div>
               <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                 <div 
                   className={cn(
                     "h-full rounded-full transition-all duration-500",
                     (server.stats?.cpu_usage || 0) > 80 ? "bg-red-500" : 
                     (server.stats?.cpu_usage || 0) > 60 ? "bg-yellow-500" : "bg-blue-500"
                   )}
                   style={{ width: `${server.stats?.cpu_usage || 0}%` }}
                 />
               </div>
             </div>
          </GlassCard>
          
          <GlassCard className="p-4 bg-white/[0.02] border-white/5">
             <div className="flex items-center gap-4 mb-3">
               <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                  <Activity className="h-5 w-5" />
               </div>
               <div className="flex-1">
                  <div className="text-sm font-bold text-white">{server.plan.specs.ram / 1024} GB RAM</div>
                  <div className="text-xs text-muted-foreground">DDR4 ECC Memory</div>
               </div>
             </div>
             <div className="space-y-1.5">
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">RAM Usage</span>
                 <span className="text-white font-medium">{server.stats?.ram_usage || 0}%</span>
               </div>
               <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                 <div 
                   className={cn(
                     "h-full rounded-full transition-all duration-500",
                     (server.stats?.ram_usage || 0) > 80 ? "bg-red-500" : 
                     (server.stats?.ram_usage || 0) > 60 ? "bg-yellow-500" : "bg-green-500"
                   )}
                   style={{ width: `${server.stats?.ram_usage || 0}%` }}
                 />
               </div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 bg-white/[0.02] border-white/5">
             <div className="flex items-center gap-4 mb-3">
               <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                  <StorageIcon className="h-5 w-5" />
               </div>
               <div className="flex-1">
                  <div className="text-sm font-bold text-white">{server.plan.specs.disk} GB Storage</div>
                  <div className="text-xs text-muted-foreground">NVMe SSD Array</div>
               </div>
             </div>
             <div className="space-y-1.5">
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">Disk Usage</span>
                 <span className="text-white font-medium">{server.stats?.disk_usage || 0}%</span>
               </div>
               <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                 <div 
                   className={cn(
                     "h-full rounded-full transition-all duration-500",
                     (server.stats?.disk_usage || 0) > 80 ? "bg-red-500" : 
                     (server.stats?.disk_usage || 0) > 60 ? "bg-yellow-500" : "bg-purple-500"
                   )}
                   style={{ width: `${server.stats?.disk_usage || 0}%` }}
                 />
               </div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4 bg-white/[0.02] border-white/5">
             <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                <Network className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-white">2.58 GB</div>
                <div className="text-xs text-muted-foreground">Traffic today</div>
             </div>
          </GlassCard>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="statistics" className="space-y-6">
          <div className="border-b border-white/10">
            <TabsList className="bg-transparent h-auto p-0 gap-6 w-full flex flex-wrap justify-start">
              {["Statistics", "IP Management", "Reinstallation", "Rescue", "Configuration", "Inventory", "Notes", "Activity Log"].map(tab => (
                 <TabsTrigger 
                    key={tab} 
                    value={tab.toLowerCase().replace(' ', '-')}
                    className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-white"
                  >
                    {tab}
                 </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="statistics" className="space-y-8 animate-in fade-in duration-300">
            
            {/* Chart Container */}
            <GlassCard className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-md">
                   {["24 HOURS", "14 DAYS", "30 DAYS", "ALL"].map((range, i) => (
                      <button 
                        key={range} 
                        className={cn(
                          "px-3 py-1 rounded text-xs font-bold transition-colors",
                          i === 0 ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-muted-foreground hover:text-white hover:bg-white/5"
                        )}
                      >
                        {range}
                      </button>
                   ))}
                </div>
                
                <h3 className="text-sm font-medium text-white uppercase tracking-wider text-center flex-1">
                  Bandwidth Usage (Port 3)
                </h3>

                <div className="flex items-center gap-2">
                   <div className="flex gap-1 text-muted-foreground">
                      <ZoomIn className="h-4 w-4 cursor-pointer hover:text-white" />
                      <ZoomOut className="h-4 w-4 cursor-pointer hover:text-white" />
                      <Home className="h-4 w-4 cursor-pointer hover:text-white" />
                      <Maximize2 className="h-4 w-4 cursor-pointer hover:text-white" />
                   </div>
                   <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 ml-2">BREAKDOWN</Button>
                </div>
              </div>

              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netData}>
                    <defs>
                      <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                       <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorIn)" name="Inbound" />
                    <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorOut)" name="Outbound" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-center gap-6 mt-4">
                 <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="text-xs font-medium text-white">Inbound Traffic</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-xs font-medium text-white">Outbound Traffic</span>
                 </div>
              </div>
            </GlassCard>
          </TabsContent>

          {["ip-management", "reinstallation", "rescue", "configuration", "inventory", "notes", "activity-log"].map(tab => (
            <TabsContent key={tab} value={tab}>
               <GlassCard className="p-12 text-center border-dashed border-white/10 bg-transparent">
                  <p className="text-muted-foreground">This module is available in the full version.</p>
               </GlassCard>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}
