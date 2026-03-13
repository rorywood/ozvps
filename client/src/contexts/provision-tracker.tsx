import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";

export type ProvisionStatus =
  | 'queued'
  | 'provisioning'
  | 'imaging'
  | 'installing'
  | 'configuring'
  | 'complete'
  | 'failed';

export interface ActiveProvision {
  serverId: string;
  serverName: string;
  status: ProvisionStatus;
  percent: number;
  startedAt: number;
  completedAt?: number;
  credentials?: {
    serverIp: string;
    username: string;
    password: string;
  };
}

interface ProvisionTrackerContextType {
  provisions: Record<string, ActiveProvision>;
  startProvision: (serverId: string | number, serverName: string, credentials?: ActiveProvision['credentials']) => void;
  dismissProvision: (serverId: string) => void;
  hasActiveProvisions: boolean;
}

const STORAGE_KEY = 'ozvps:activeProvisions';
const STATUS_PERCENT: Record<ProvisionStatus, number> = {
  queued: 10,
  provisioning: 25,
  imaging: 45,
  installing: 65,
  configuring: 85,
  complete: 100,
  failed: 0,
};

function mapPhaseToStatus(phase: string | undefined, buildFailed?: boolean): ProvisionStatus {
  if (buildFailed) return 'failed';
  if (!phase) return 'provisioning';
  const p = phase.toLowerCase();
  if (p.includes('queue')) return 'queued';
  if (p.includes('provision')) return 'provisioning';
  if (p.includes('imag') || p.includes('download')) return 'imaging';
  if (p.includes('install')) return 'installing';
  if (p.includes('config') || p.includes('reboot') || p.includes('boot')) return 'configuring';
  if (p.includes('complete') || p.includes('done') || p.includes('finish')) return 'complete';
  if (p.includes('fail') || p.includes('error')) return 'failed';
  return 'installing';
}

function loadProvisions(): Record<string, ActiveProvision> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveProvisions(provisions: Record<string, ActiveProvision>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(provisions));
  } catch { /* ignore */ }
}

const ProvisionTrackerContext = createContext<ProvisionTrackerContextType | null>(null);

export function ProvisionTrackerProvider({ children }: { children: ReactNode }) {
  const [provisions, setProvisions] = useState<Record<string, ActiveProvision>>(loadProvisions);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const provisionsRef = useRef(provisions);
  provisionsRef.current = provisions;

  const updateProvisions = useCallback((updater: (prev: Record<string, ActiveProvision>) => Record<string, ActiveProvision>) => {
    setProvisions(prev => {
      const next = updater(prev);
      saveProvisions(next);
      return next;
    });
  }, []);

  const pollAll = useCallback(async () => {
    const current = provisionsRef.current;
    const active = Object.values(current).filter(p => p.status !== 'complete' && p.status !== 'failed');
    if (active.length === 0) return;

    await Promise.all(active.map(async (provision) => {
      try {
        const buildStatus = await api.getBuildStatus(provision.serverId);

        if (buildStatus.commissioned === 3 && !buildStatus.isBuilding) {
          // Complete
          updateProvisions(prev => {
            if (!prev[provision.serverId]) return prev;
            if (prev[provision.serverId].status === 'complete') return prev;
            return {
              ...prev,
              [provision.serverId]: {
                ...prev[provision.serverId],
                status: 'complete',
                percent: 100,
                completedAt: Date.now(),
              },
            };
          });
        } else if (buildStatus.isError) {
          updateProvisions(prev => {
            if (!prev[provision.serverId]) return prev;
            return {
              ...prev,
              [provision.serverId]: { ...prev[provision.serverId], status: 'failed' },
            };
          });
        } else {
          const newStatus = mapPhaseToStatus(buildStatus.phase);
          const newPercent = STATUS_PERCENT[newStatus];
          updateProvisions(prev => {
            if (!prev[provision.serverId]) return prev;
            const existing = prev[provision.serverId];
            // Never go backward
            if (newPercent <= existing.percent && newStatus === existing.status) return prev;
            return {
              ...prev,
              [provision.serverId]: {
                ...existing,
                status: newPercent > existing.percent ? newStatus : existing.status,
                percent: Math.max(existing.percent, newPercent),
              },
            };
          });
        }
      } catch { /* network error, ignore */ }
    }));
  }, [updateProvisions]);

  // Start polling when there are active provisions
  useEffect(() => {
    const active = Object.values(provisions).filter(p => p.status !== 'complete' && p.status !== 'failed');

    if (active.length > 0 && !pollRef.current) {
      pollRef.current = setInterval(pollAll, 3000);
    } else if (active.length === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [provisions, pollAll]);

  // Auto-dismiss completed provisions after 30 seconds
  useEffect(() => {
    const completed = Object.values(provisions).filter(
      p => p.status === 'complete' && p.completedAt && Date.now() - p.completedAt > 30000
    );
    if (completed.length > 0) {
      updateProvisions(prev => {
        const next = { ...prev };
        completed.forEach(p => delete next[p.serverId]);
        return next;
      });
    }
  }, [provisions, updateProvisions]);

  const startProvision = useCallback((serverId: string | number, serverName: string, credentials?: ActiveProvision['credentials']) => {
    const id = String(serverId);
    const provision: ActiveProvision = {
      serverId: id,
      serverName,
      status: 'queued',
      percent: 10,
      startedAt: Date.now(),
      credentials,
    };
    updateProvisions(prev => ({ ...prev, [id]: provision }));
  }, [updateProvisions]);

  const dismissProvision = useCallback((serverId: string) => {
    updateProvisions(prev => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  }, [updateProvisions]);

  const hasActiveProvisions = Object.values(provisions).some(p => p.status !== 'failed');

  return (
    <ProvisionTrackerContext.Provider value={{ provisions, startProvision, dismissProvision, hasActiveProvisions }}>
      {children}
    </ProvisionTrackerContext.Provider>
  );
}

export function useProvisionTracker() {
  const ctx = useContext(ProvisionTrackerContext);
  if (!ctx) throw new Error('useProvisionTracker must be used within ProvisionTrackerProvider');
  return ctx;
}
