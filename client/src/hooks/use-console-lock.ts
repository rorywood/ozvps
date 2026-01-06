import { useState, useEffect, useCallback, useRef } from "react";

const SESSION_KEY_PREFIX = 'consoleLockUntil:';
const LOCK_DURATION_MS = 15000;

function getSessionKey(serverId: string): string {
  return `${SESSION_KEY_PREFIX}${serverId}`;
}

function getLockExpiry(serverId: string): number | null {
  try {
    const stored = sessionStorage.getItem(getSessionKey(serverId));
    if (stored) {
      const expiry = parseInt(stored, 10);
      if (!isNaN(expiry)) {
        return expiry;
      }
    }
  } catch (e) {
    console.error('Failed to get console lock expiry:', e);
  }
  return null;
}

function setLockExpiry(serverId: string, expiry: number): void {
  try {
    sessionStorage.setItem(getSessionKey(serverId), expiry.toString());
  } catch (e) {
    console.error('Failed to set console lock expiry:', e);
  }
}

function clearLockExpiry(serverId: string): void {
  try {
    sessionStorage.removeItem(getSessionKey(serverId));
  } catch (e) {
    console.error('Failed to clear console lock expiry:', e);
  }
}

export interface ConsoleLockState {
  isLocked: boolean;
  remainingSeconds: number;
}

export function useConsoleLock(serverId: string, serverStatus?: string) {
  const [state, setState] = useState<ConsoleLockState>(() => {
    const expiry = getLockExpiry(serverId);
    if (expiry && expiry > Date.now()) {
      return {
        isLocked: true,
        remainingSeconds: Math.ceil((expiry - Date.now()) / 1000),
      };
    }
    return { isLocked: false, remainingSeconds: 0 };
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const expiryRef = useRef<number | null>(getLockExpiry(serverId));

  const clearLock = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearLockExpiry(serverId);
    expiryRef.current = null;
    setState({ isLocked: false, remainingSeconds: 0 });
  }, [serverId]);

  const startLock = useCallback(() => {
    const expiry = Date.now() + LOCK_DURATION_MS;
    setLockExpiry(serverId, expiry);
    expiryRef.current = expiry;
    setState({
      isLocked: true,
      remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
    });

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = expiryRef.current ? expiryRef.current - now : 0;
      
      if (remaining <= 0) {
        clearLock();
      } else {
        setState({
          isLocked: true,
          remainingSeconds: Math.ceil(remaining / 1000),
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
    const expiry = getLockExpiry(serverId);
    if (expiry && expiry > Date.now()) {
      expiryRef.current = expiry;
      setState({
        isLocked: true,
        remainingSeconds: Math.ceil((expiry - Date.now()) / 1000),
      });

      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          const now = Date.now();
          const remaining = expiryRef.current ? expiryRef.current - now : 0;
          
          if (remaining <= 0) {
            clearLock();
          } else {
            setState({
              isLocked: true,
              remainingSeconds: Math.ceil(remaining / 1000),
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
