import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

export interface ReinstallTaskState {
  isActive: boolean;
  taskId: string | null;
  status: ReinstallStatus;
  percent: number;
  error: string | null;
  timeline: TimelineEvent[];
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
      };
    }
    return {
      isActive: false,
      taskId: null,
      status: 'idle',
      percent: 0,
      error: null,
      timeline: [],
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
        return { ...prev, timeline: newTimeline };
      });
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const poll = useCallback(async () => {
    try {
      const buildStatus = await api.getBuildStatus(serverId);
      
      let newStatus: ReinstallStatus;
      let newPercent: number;
      
      if (buildStatus.isError) {
        newStatus = 'failed';
        newPercent = state.percent;
        addTimelineEvent('failed', 'Installation failed');
        stopPolling();
        setState(prev => ({
          ...prev,
          isActive: true, // Keep active so dialog stays open for user to see error
          status: 'failed',
          error: 'Server reinstallation encountered an error.',
        }));
        clearTaskState(serverId);
        return;
      } else if (buildStatus.isComplete) {
        newStatus = 'complete';
        newPercent = 100;
        addTimelineEvent('complete', 'Installation complete');
        stopPolling();
        setState(prev => ({
          ...prev,
          isActive: true, // Keep active so dialog stays open for user to see success
          status: 'complete',
          percent: 100,
        }));
        clearTaskState(serverId);
        return;
      } else if (buildStatus.isBuilding) {
        newStatus = mapVirtFusionStatus(buildStatus.phase);
        newPercent = buildStatus.percent ?? STATUS_PERCENT_MAP[newStatus];
        addTimelineEvent(newStatus);
      } else {
        newStatus = 'queued';
        newPercent = 5;
      }

      setState(prev => ({
        ...prev,
        status: newStatus,
        percent: newPercent,
      }));

      saveTaskState(serverId, {
        isActive: true,
        taskId: state.taskId,
        status: newStatus,
        percent: newPercent,
        timeline: state.timeline,
      });

    } catch (e) {
      console.error('Failed to poll reinstall status:', e);
    }
  }, [serverId, state.taskId, state.percent, state.timeline, addTimelineEvent, stopPolling]);

  const startTask = useCallback((taskId?: string) => {
    const initialState: ReinstallTaskState = {
      isActive: true,
      taskId: taskId || null,
      status: 'queued',
      percent: 5,
      error: null,
      timeline: [{ status: 'queued', timestamp: Date.now(), message: 'Reinstall started' }],
    };
    
    setState(initialState);
    lastStatusRef.current = 'queued';
    saveTaskState(serverId, initialState);

    stopPolling();
    pollCountRef.current = 0;

    pollRef.current = setInterval(() => {
      pollCountRef.current++;
      poll();
      
      if (pollCountRef.current === 15) {
        stopPolling();
        pollRef.current = setInterval(poll, 5000);
      }
    }, 2000);
  }, [serverId, poll, stopPolling]);

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
    });
    lastStatusRef.current = 'idle';
  }, [serverId, stopPolling]);

  // On mount, verify if there's actually an active task from VirtFusion
  // This prevents stale UI when user refreshes after reinstall completes
  useEffect(() => {
    const verifyActiveTask = async () => {
      if (!serverId) return;
      
      try {
        const buildStatus = await api.getBuildStatus(serverId);
        
        // If no active build and we have a stored state showing active, reset it
        if (!buildStatus.isBuilding && state.isActive && state.status !== 'complete' && state.status !== 'failed') {
          // Check if the build completed while we were away
          if (buildStatus.isComplete) {
            setState(prev => ({
              ...prev,
              status: 'complete',
              percent: 100,
              isActive: true, // Keep open to show completion
            }));
            clearTaskState(serverId);
          } else if (!buildStatus.isBuilding && !buildStatus.isComplete && !buildStatus.isError) {
            // No active task at all - force reset
            reset();
          }
        }
      } catch (e) {
        console.error('Failed to verify reinstall task state:', e);
      }
    };

    if (state.isActive) {
      verifyActiveTask();
    }
  }, [serverId]); // Only run on mount

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
    reset,
  };
}
