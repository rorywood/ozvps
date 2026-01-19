import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

export interface ReinstallCredentials {
  serverIp: string;
  username: string;
  password: string;
}

export interface ReinstallTaskState {
  isActive: boolean;
  taskId: string | null;
  status: ReinstallStatus;
  percent: number;
  error: string | null;
  timeline: TimelineEvent[];
  credentials: ReinstallCredentials | null;
  rebootingStartTime?: number; // Timestamp when we entered 'rebooting' status
}

export type ReinstallStatus = 
  | 'idle'
  | 'queued'
  | 'provisioning'
  | 'imaging'
  | 'installing'
  | 'configuring'
  | 'rebooting'
  | 'complete'
  | 'failed';

export interface TimelineEvent {
  status: ReinstallStatus;
  timestamp: number;
  message?: string;
}

const STATUS_PERCENT_MAP: Record<ReinstallStatus, number> = {
  idle: 0,
  queued: 5,
  provisioning: 20,
  imaging: 40,
  installing: 65,
  configuring: 85,
  rebooting: 95,
  complete: 100,
  failed: 0,
};

const SESSION_KEY_PREFIX = 'reinstallTask:';

function getSessionKey(serverId: string): string {
  return `${SESSION_KEY_PREFIX}${serverId}`;
}

function loadTaskState(serverId: string): Partial<ReinstallTaskState> | null {
  try {
    const stored = sessionStorage.getItem(getSessionKey(serverId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load reinstall task state:', e);
  }
  return null;
}

function saveTaskState(serverId: string, state: Partial<ReinstallTaskState>): void {
  try {
    sessionStorage.setItem(getSessionKey(serverId), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save reinstall task state:', e);
  }
}

function clearTaskState(serverId: string): void {
  try {
    sessionStorage.removeItem(getSessionKey(serverId));
  } catch (e) {
    console.error('Failed to clear reinstall task state:', e);
  }
}

function mapVirtFusionStatus(phase: string | undefined, buildFailed?: boolean): ReinstallStatus {
  if (buildFailed) return 'failed';
  if (!phase) return 'idle';
  
  const normalized = phase.toLowerCase();
  if (normalized.includes('queue')) return 'queued';
  if (normalized.includes('provision')) return 'provisioning';
  if (normalized.includes('imag') || normalized.includes('download')) return 'imaging';
  if (normalized.includes('install')) return 'installing';
  if (normalized.includes('config')) return 'configuring';
  if (normalized.includes('reboot') || normalized.includes('boot')) return 'rebooting';
  if (normalized.includes('complete') || normalized.includes('done') || normalized.includes('finish')) return 'complete';
  if (normalized.includes('fail') || normalized.includes('error')) return 'failed';
  
  return 'installing';
}

export function useReinstallTask(serverId: string) {
  const [state, setState] = useState<ReinstallTaskState>(() => {
    const stored = loadTaskState(serverId);
    if (stored && stored.isActive) {
      return {
        isActive: true,
        taskId: stored.taskId || null,
        status: stored.status || 'queued',
        percent: stored.percent || 5,
        error: null,
        timeline: stored.timeline || [],
        credentials: stored.credentials || null,
        rebootingStartTime: stored.rebootingStartTime,
      };
    }
    return {
      isActive: false,
      taskId: null,
      status: 'idle',
      percent: 0,
      error: null,
      timeline: [],
      credentials: null,
      rebootingStartTime: undefined,
    };
  });

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const lastStatusRef = useRef<ReinstallStatus>('idle');

  const addTimelineEvent = useCallback((status: ReinstallStatus, message?: string) => {
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status;
      setState(prev => {
        const newTimeline = [
          ...prev.timeline,
          { status, timestamp: Date.now(), message }
        ];
        const updated = { ...prev, timeline: newTimeline };

        // CRITICAL FIX: Persist timeline to sessionStorage immediately
        saveTaskState(serverId, {
          isActive: prev.isActive,
          taskId: prev.taskId,
          status: prev.status,
          percent: prev.percent,
          timeline: newTimeline,
          credentials: prev.credentials,
          rebootingStartTime: prev.rebootingStartTime,
        });

        return updated;
      });
    }
  }, [serverId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const poll = useCallback(async () => {
    try {
      // Don't poll if already complete - prevents race conditions
      if (lastStatusRef.current === 'complete') {
        stopPolling();
        return;
      }

      const buildStatus = await api.getBuildStatus(serverId);

      // COMMISSIONED: Server is built (commissioned=3) - mark as complete
      if (buildStatus.commissioned === 3 && !buildStatus.isBuilding) {
        // Set ref immediately and stop polling (already checked for complete at start of poll)
        lastStatusRef.current = 'complete';
        stopPolling();

        setState(prev => {
          if (prev.status === 'complete') {
            return prev;
          }

          const newTimeline = [
            ...prev.timeline,
            { status: 'complete' as ReinstallStatus, timestamp: Date.now(), message: 'Server ready' }
          ];
          const completed = {
            ...prev,
            isActive: true,
            status: 'complete' as ReinstallStatus,
            percent: 100,
            timeline: newTimeline,
          };
          saveTaskState(serverId, {
            isActive: true,
            taskId: prev.taskId,
            status: 'complete',
            percent: 100,
            timeline: newTimeline,
            credentials: prev.credentials,
          });
          return completed;
        });

        return;
      }

      // ERROR: Build failed
      if (buildStatus.isError) {
        addTimelineEvent('failed', 'Installation failed');
        stopPolling();
        setState(prev => ({
          ...prev,
          isActive: true,
          status: 'failed' as ReinstallStatus,
          error: 'Server installation encountered an error.',
        }));
        clearTaskState(serverId);
        return;
      }

      // BUILDING: commissioned 0 or 1 = still building
      const commissioned = buildStatus.commissioned;
      const stillBuilding = commissioned === 0 || commissioned === 1 || commissioned === undefined || commissioned === null;

      if (stillBuilding) {
        // Determine status from phase or default to provisioning
        let newStatus: ReinstallStatus = 'provisioning';
        if (buildStatus.phase) {
          newStatus = mapVirtFusionStatus(buildStatus.phase);
        } else if (commissioned === 0) {
          newStatus = 'queued';
        }

        const newPercent = STATUS_PERCENT_MAP[newStatus];

        // Only update if status changed (prevent unnecessary re-renders)
        setState(prev => {
          if (prev.status === newStatus && prev.percent === newPercent) {
            return prev; // No change, skip update
          }

          // NEVER GO BACKWARD: If new percent is less than current, keep current
          const finalPercent = newPercent < prev.percent ? prev.percent : newPercent;
          const finalStatus = finalPercent === prev.percent ? prev.status : newStatus;

          if (finalStatus !== prev.status) {
            addTimelineEvent(finalStatus);
          }

          const updated = {
            ...prev,
            status: finalStatus,
            percent: finalPercent,
          };

          saveTaskState(serverId, {
            isActive: true,
            taskId: prev.taskId,
            status: finalStatus,
            percent: finalPercent,
            timeline: prev.timeline,
            credentials: prev.credentials,
            rebootingStartTime: prev.rebootingStartTime,
          });

          return updated;
        });
      }

    } catch (e) {
      console.error('[useReinstallTask] Poll error:', e);
    }
  }, [serverId, addTimelineEvent, stopPolling]);

  const startTask = useCallback((taskId?: string, password?: string, serverIp?: string) => {
    const credentials = password ? { serverIp: serverIp || 'N/A', username: 'root', password } : null;
    const initialState: ReinstallTaskState = {
      isActive: true,
      taskId: taskId || null,
      status: 'queued',
      percent: 5,
      error: null,
      timeline: [{ status: 'queued', timestamp: Date.now(), message: 'Installation started' }],
      credentials,
      rebootingStartTime: undefined,
    };

    setState(initialState);
    lastStatusRef.current = 'queued';
    saveTaskState(serverId, initialState);

    // Stop any existing polling
    stopPolling();
    pollCountRef.current = 0;

    // Start polling: Fast for 30 seconds (15 polls * 2s), then slow to 5s
    pollRef.current = setInterval(() => {
      pollCountRef.current++;
      poll();

      if (pollCountRef.current === 15) {
        stopPolling();
        pollRef.current = setInterval(poll, 5000);
      }
    }, 2000);
  }, [serverId, poll, stopPolling]);

  const markComplete = useCallback(() => {
    stopPolling();
    addTimelineEvent('complete', 'Server ready');
    setState(prev => {
      const updated = {
        ...prev,
        status: 'complete' as ReinstallStatus,
        percent: 100,
      };
      saveTaskState(serverId, {
        ...updated,
        timeline: [...prev.timeline, { status: 'complete', timestamp: Date.now(), message: 'Server ready' }],
      });
      return updated;
    });
    lastStatusRef.current = 'complete';
  }, [serverId, stopPolling, addTimelineEvent]);

  const reset = useCallback(() => {
    stopPolling();
    clearTaskState(serverId);
    setState({
      isActive: false,
      taskId: null,
      status: 'idle',
      percent: 0,
      error: null,
      timeline: [],
      credentials: null,
      rebootingStartTime: undefined,
    });
    lastStatusRef.current = 'idle';
  }, [serverId, stopPolling]);

  // Check build status - SIMPLIFIED: Just ensure polling is active if task is active
  const checkBuildStatus = useCallback(async () => {
    if (!serverId) return;

    // If we have an active task but polling stopped, restart it
    if (state.isActive && state.status !== 'complete' && state.status !== 'failed' && !pollRef.current) {
      pollRef.current = setInterval(poll, 5000);
    }
  }, [serverId, state.isActive, state.status, poll]);

  // On mount, verify if there's actually an active task from VirtFusion
  // This prevents stale UI when user refreshes after reinstall completes
  // Also detects builds started from other sessions/devices
  useEffect(() => {
    checkBuildStatus();
  }, [checkBuildStatus]); // Properly include checkBuildStatus to avoid stale closures

  // Handle tab visibility changes - immediately check status when user returns to tab
  // This fixes the issue where browser throttles timers when tab is backgrounded
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isActive && state.status !== 'complete' && state.status !== 'failed') {
        // User returned to tab while build is active - immediately check status
        checkBuildStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isActive, state.status, checkBuildStatus]);

  useEffect(() => {
    if (state.isActive && state.status !== 'complete' && state.status !== 'failed' && !pollRef.current) {
      pollRef.current = setInterval(poll, 5000);
    }

    return () => {
      stopPolling();
    };
  }, [state.isActive, state.status, poll, stopPolling]);

  return {
    ...state,
    startTask,
    markComplete,
    reset,
  };
}
