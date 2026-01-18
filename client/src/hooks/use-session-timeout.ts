import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

// Match server-side timeout: 15 minutes
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
// Check session validity every minute
const CHECK_INTERVAL_MS = 60 * 1000;
// Warn user 2 minutes before timeout
const WARNING_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Hook to handle automatic session timeout and logout on inactivity.
 * Monitors user activity and logs them out after 15 minutes of inactivity (matching server-side timeout).
 */
export function useSessionTimeout() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warnedRef = useRef<boolean>(false);

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
  }, []);

  // Check if session has expired due to inactivity
  const checkSession = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;

    // If user has been inactive for longer than timeout, log them out
    if (timeSinceLastActivity >= IDLE_TIMEOUT_MS) {
      // Clear all cached data
      queryClient.clear();

      // Store session timeout message
      sessionStorage.setItem('sessionError', JSON.stringify({
        error: 'Your session expired due to inactivity. Please sign in again.',
        code: 'SESSION_IDLE_TIMEOUT'
      }));

      // Redirect to login
      window.location.href = '/login';
      return;
    }

    // Warn user if they're approaching timeout (could show a toast here)
    if (timeSinceLastActivity >= IDLE_TIMEOUT_MS - WARNING_THRESHOLD_MS && !warnedRef.current) {
      warnedRef.current = true;
    }
  }, [queryClient]);

  useEffect(() => {
    // Activities that should reset the timeout
    const activities = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    // Throttle activity updates to avoid excessive calls
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledUpdateActivity = () => {
      if (!throttleTimeout) {
        updateActivity();
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 1000); // Update at most once per second
      }
    };

    // Add activity listeners
    activities.forEach(activity => {
      window.addEventListener(activity, throttledUpdateActivity, { passive: true });
    });

    // Start periodic session checks
    checkIntervalRef.current = setInterval(checkSession, CHECK_INTERVAL_MS);

    // Cleanup
    return () => {
      activities.forEach(activity => {
        window.removeEventListener(activity, throttledUpdateActivity);
      });

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
    };
  }, [updateActivity, checkSession]);

  // Also check immediately when component mounts
  useEffect(() => {
    checkSession();
  }, [checkSession]);
}
