import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { 
  Network, 
  Globe, 
  ShieldCheck, 
  Activity,
  ArrowUpRight,
  ArrowDownLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const trafficData = [
  { time: '00:00', in: 40, out: 24 },
  { time: '04:00', in: 30, out: 13 },
  { time: '08:00', in: 20, out: 98 },
  { time: '12:00', in: 27, out: 39 },
  { time: '16:00', in: 18, out: 48 },
  { time: '20:00', in: 23, out: 38 },
  { time: '24:00', in: 34, out: 43 },
];

const ipAddresses = [
  { ip: "192.168.1.101", type: "IPv4", server: "web-prod-01", gateway: "192.168.1.1", netmask: "255.255.255.0", status: "assigned" },
  { ip: "192.168.1.102", type: "IPv4", server: "db-primary", gateway: "192.168.1.1", netmask: "255.255.255.0", status: "assigned" },
  { ip: "192.168.1.103", type: "IPv4", server: "worker-node-alpha", gateway: "192.168.1.1", netmask: "255.255.255.0", status: "assigned" },
  { ip: "2001:db8::1", type: "IPv6", server: "web-prod-01", gateway: "fe80::1", netmask: "/64", status: "assigned" },
  { ip: "192.168.1.104", type: "IPv4", server: "-", gateway: "192.168.1.1", netmask: "255.255.255.0", status: "available" },
];

export default function Networking() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Networking</h1>
          <p className="text-muted-foreground">Manage IP addresses and view traffic statistics</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Traffic Chart */}
          <GlassCard className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Network Traffic
              </h3>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Inbound</span>
                </div>
                <div className="flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-muted-foreground">Outbound</span>
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="in" stroke="hsl(217 91% 60%)" strokeWidth={2} fillOpacity={1} fill="url(#colorIn)" />
                  <Area type="monotone" dataKey="out" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorOut)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Stats Cards */}
          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                  <ArrowDownLeft className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Inbound</p>
                  <p className="text-2xl font-bold text-white font-display">1.2 TB</p>
                </div>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 w-[60%]" />
              </div>
            </GlassCard>

             <GlassCard className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Outbound</p>
                  <p className="text-2xl font-bold text-white font-display">850 GB</p>
                </div>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-[40%]" />
              </div>
            </GlassCard>

            <GlassCard className="p-6 bg-gradient-to-br from-primary/20 to-purple-500/20 border-primary/20">
              <h3 className="font-semibold text-white mb-2">Need more IPs?</h3>
              <p className="text-sm text-muted-foreground mb-4">Request additional IPv4 blocks for your infrastructure.</p>
              <Button size="sm" className="w-full bg-white/10 hover:bg-white/20 text-white border-0">Request Block</Button>
            </GlassCard>
          </div>
        </div>

        {/* IP Inventory */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">IP Inventory</h2>
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-muted-foreground font-medium uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4">IP Address</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4">Gateway</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ipAddresses.map((ip, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-mono text-white">{ip.ip}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border",
                          ip.type === 'IPv4' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        )}>{ip.type}</span>
                      </td>
                      <td className="px-6 py-4 text-white">
                        {ip.server !== '-' ? (
                          <div className="flex items-center gap-2">
                             <Globe className="h-3 w-3 text-muted-foreground" />
                             {ip.server}
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono">{ip.gateway}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "flex items-center gap-1.5 text-xs font-medium",
                          ip.status === 'assigned' ? "text-green-400" : "text-muted-foreground"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", ip.status === 'assigned' ? "bg-green-400" : "bg-muted-foreground")} />
                          {ip.status === 'assigned' ? "Assigned" : "Available"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-white">Manage</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
