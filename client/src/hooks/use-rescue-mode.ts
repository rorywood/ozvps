import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

export interface RescueCredentials {
  username: string;
  password: string;
}

export interface RescueModeState {
  isSupported: boolean;
  isActive: boolean;
  isEnabling: boolean;
  isDisabling: boolean;
  isLoading: boolean;
  error: string | null;
  credentials: RescueCredentials | null;
}

const POLL_INTERVAL_FAST = 2000;
const POLL_INTERVAL_SLOW = 5000;

export function useRescueMode(serverId: string) {
  const [state, setState] = useState<RescueModeState>({
    isSupported: true,
    isActive: false,
    isEnabling: false,
    isDisabling: false,
    isLoading: true,
    error: null,
    credentials: null,
  });

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await api.getRescueStatus(serverId);
      setState(prev => ({
        ...prev,
        isSupported: status.isSupported,
        isActive: status.isActive,
        isEnabling: status.isEnabling,
        isDisabling: status.isDisabling,
        isLoading: false,
        error: status.error || null,
        credentials: status.credentials || prev.credentials,
      }));

      if (!status.isEnabling && !status.isDisabling) {
        stopPolling();
      }

      return status;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch rescue status',
      }));
      return null;
    }
  }, [serverId, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollCountRef.current = 0;

    const poll = async () => {
      pollCountRef.current++;
      const status = await fetchStatus();
      
      if (status && !status.isEnabling && !status.isDisabling) {
        stopPolling();
        return;
      }

      const interval = pollCountRef.current < 5 ? POLL_INTERVAL_FAST : POLL_INTERVAL_SLOW;
      pollRef.current = setTimeout(poll, interval);
    };

    poll();
  }, [fetchStatus, stopPolling]);

  const enableRescue = useCallback(async () => {
    setState(prev => ({ ...prev, isEnabling: true, error: null }));
    
    try {
      const result = await api.enableRescueMode(serverId);
      
      setState(prev => ({
        ...prev,
        credentials: result.credentials || null,
      }));

      startPolling();
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isEnabling: false,
        error: error.message || 'Failed to enable rescue mode',
      }));
      throw error;
    }
  }, [serverId, startPolling]);

  const disableRescue = useCallback(async () => {
    setState(prev => ({ ...prev, isDisabling: true, error: null, credentials: null }));
    
    try {
      const result = await api.disableRescueMode(serverId);
      startPolling();
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isDisabling: false,
        error: error.message || 'Failed to disable rescue mode',
      }));
      throw error;
    }
  }, [serverId, startPolling]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  return {
    ...state,
    enableRescue,
    disableRescue,
    refetch: fetchStatus,
    clearError,
  };
}
