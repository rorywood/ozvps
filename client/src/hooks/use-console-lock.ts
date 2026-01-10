import { useState, useEffect, useCallback, useRef } from "react";

const SESSION_KEY_PREFIX = 'consoleLockUntil:';
const SESSION_ACTION_PREFIX = 'consoleLockAction:';
const LOCK_DURATION_MS = 25000;

function getSessionKey(serverId: string): string {
  return `${SESSION_KEY_PREFIX}${serverId}`;
}

function getActionKey(serverId: string): string {
  return `${SESSION_ACTION_PREFIX}${serverId}`;
}

interface LockData {
  expiry: number | null;
  action: 'boot' | 'reboot' | 'reinstall' | null;
}

function getLockData(serverId: string): LockData {
  try {
    const stored = sessionStorage.getItem(getSessionKey(serverId));
    const storedAction = sessionStorage.getItem(getActionKey(serverId));
    if (stored) {
      const expiry = parseInt(stored, 10);
      if (!isNaN(expiry)) {
        return {
          expiry,
          action: (storedAction as 'boot' | 'reboot' | 'reinstall') || null,
        };
      }
    }
  } catch (e) {
    console.error('Failed to get console lock data:', e);
  }
  return { expiry: null, action: null };
}

function setLockData(serverId: string, expiry: number, action: 'boot' | 'reboot' | 'reinstall'): void {
  try {
    sessionStorage.setItem(getSessionKey(serverId), expiry.toString());
    sessionStorage.setItem(getActionKey(serverId), action);
  } catch (e) {
    console.error('Failed to set console lock data:', e);
  }
}

function clearLockData(serverId: string): void {
  try {
    sessionStorage.removeItem(getSessionKey(serverId));
    sessionStorage.removeItem(getActionKey(serverId));
  } catch (e) {
    console.error('Failed to clear console lock data:', e);
  }
}

export interface ConsoleLockState {
  isLocked: boolean;
  remainingSeconds: number;
  action: 'boot' | 'reboot' | 'reinstall' | null;
}

export function useConsoleLock(serverId: string, serverStatus?: string) {
  const [state, setState] = useState<ConsoleLockState>(() => {
    const lockData = getLockData(serverId);
    if (lockData.expiry && lockData.expiry > Date.now()) {
      return {
        isLocked: true,
        remainingSeconds: Math.ceil((lockData.expiry - Date.now()) / 1000),
        action: lockData.action,
      };
    }
    return { isLocked: false, remainingSeconds: 0, action: null };
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lockDataRef = useRef<LockData>(getLockData(serverId));

  const clearLock = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearLockData(serverId);
    lockDataRef.current = { expiry: null, action: null };
    setState({ isLocked: false, remainingSeconds: 0, action: null });
  }, [serverId]);

  const startLock = useCallback((action: 'boot' | 'reboot' | 'reinstall' = 'reboot') => {
    const expiry = Date.now() + LOCK_DURATION_MS;
    setLockData(serverId, expiry, action);
    lockDataRef.current = { expiry, action };
    setState({
      isLocked: true,
      remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
      action,
    });

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = lockDataRef.current.expiry ? lockDataRef.current.expiry - now : 0;

      if (remaining <= 0) {
        clearLock();
      } else {
        setState({
          isLocked: true,
          remainingSeconds: Math.ceil(remaining / 1000),
          action: lockDataRef.current.action,
        });
      }
    }, 1000);
  }, [serverId, clearLock]);

  useEffect(() => {
    if (serverStatus === 'stopped' || serverStatus === 'suspended') {
      clearLock();
    }
  }, [serverStatus, clearLock]);

  useEffect(() => {
    const lockData = getLockData(serverId);
    if (lockData.expiry && lockData.expiry > Date.now()) {
      lockDataRef.current = lockData;
      setState({
        isLocked: true,
        remainingSeconds: Math.ceil((lockData.expiry - Date.now()) / 1000),
        action: lockData.action,
      });

      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          const now = Date.now();
          const remaining = lockDataRef.current.expiry ? lockDataRef.current.expiry - now : 0;

          if (remaining <= 0) {
            clearLock();
          } else {
            setState({
              isLocked: true,
              remainingSeconds: Math.ceil(remaining / 1000),
              action: lockDataRef.current.action,
            });
          }
        }, 1000);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [serverId, clearLock]);

  return {
    ...state,
    startLock,
    clearLock,
  };
}
