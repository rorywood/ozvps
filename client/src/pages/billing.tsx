import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { 
  CreditCard, 
  DollarSign, 
  Receipt, 
  Clock,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const usageData = [
  { month: 'Jan', amount: 120 },
  { month: 'Feb', amount: 132 },
  { month: 'Mar', amount: 101 },
  { month: 'Apr', amount: 134 },
  { month: 'May', amount: 190 },
  { month: 'Jun', amount: 150 },
  { month: 'Jul', amount: 145 },
];

const transactions = [
  { id: "INV-2024-001", date: "Jul 01, 2024", amount: 145.50, status: "paid", description: "Monthly Usage - June 2024" },
  { id: "INV-2024-002", date: "Jun 01, 2024", amount: 138.20, status: "paid", description: "Monthly Usage - May 2024" },
  { id: "INV-2024-003", date: "May 01, 2024", amount: 124.00, status: "paid", description: "Monthly Usage - April 2024" },
  { id: "CR-2024-001", date: "Apr 15, 2024", amount: 50.00, status: "credit", description: "Account Credit - Promo" },
];

export default function Billing() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Billing & Usage</h1>
          <p className="text-muted-foreground">Monitor your spending and manage invoices</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-6 bg-gradient-to-br from-primary/20 to-blue-600/10 border-primary/20 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
               <DollarSign className="h-24 w-24 text-primary" />
             </div>
             <h3 className="text-sm font-medium text-primary mb-2">Current Balance</h3>
             <div className="text-4xl font-display font-bold text-white mb-4">$145.50</div>
             <div className="flex gap-2">
               <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-lg shadow-primary/20">Add Funds</Button>
               <Button size="sm" variant="outline" className="border-white/10 hover:bg-white/10 text-white">Auto-Recharge</Button>
             </div>
          </GlassCard>

          <GlassCard className="md:col-span-2 p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              Usage History
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="amount" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">Invoices & Transactions</h2>
          <GlassCard className="overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-muted-foreground font-medium uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Invoice ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map((tx, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-white">{tx.id}</td>
                    <td className="px-6 py-4 text-muted-foreground">{tx.date}</td>
                    <td className="px-6 py-4 text-white">{tx.description}</td>
                    <td className="px-6 py-4 text-white font-medium">${tx.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold border uppercase",
                        tx.status === 'paid' ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      )}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-white">
                         <Download className="h-4 w-4" />
                       </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
