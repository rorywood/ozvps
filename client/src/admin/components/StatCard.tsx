import { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  color: 'cyan' | 'purple' | 'amber' | 'green' | 'red';
}

export function StatCard({ icon, label, value, detail, color }: StatCardProps) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-slate-400 text-sm">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {detail && <p className="text-xs text-slate-500 mt-1">{detail}</p>}
    </div>
  );
}
