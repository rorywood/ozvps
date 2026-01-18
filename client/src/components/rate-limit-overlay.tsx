import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

const RATE_LIMIT_KEY = "ozvps_rate_limited_until";

// Persist rate limit across page reloads using localStorage
export function triggerRateLimit(seconds: number = 10) {
  const until = Date.now() + seconds * 1000;
  try {
    localStorage.setItem(RATE_LIMIT_KEY, String(until));
  } catch {
    // localStorage might be unavailable
  }
  // Force re-render by triggering storage event manually for same-tab
  window.dispatchEvent(new Event("rate-limit-triggered"));
}

export function isRateLimited(): boolean {
  try {
    const until = localStorage.getItem(RATE_LIMIT_KEY);
    if (until && Date.now() < parseInt(until, 10)) {
      return true;
    }
    // Clear expired rate limit
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    // localStorage might be unavailable
  }
  return false;
}

function getRateLimitSecondsLeft(): number {
  try {
    const until = localStorage.getItem(RATE_LIMIT_KEY);
    if (until) {
      const remaining = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    }
  } catch {
    // localStorage might be unavailable
  }
  return 0;
}

export function RateLimitOverlay() {
  const [secondsLeft, setSecondsLeft] = useState(() => getRateLimitSecondsLeft());
  const [visible, setVisible] = useState(() => isRateLimited());

  useEffect(() => {
    const checkRateLimit = () => {
      const remaining = getRateLimitSecondsLeft();
      if (remaining > 0) {
        setVisible(true);
        setSecondsLeft(remaining);
      } else {
        setVisible(false);
        try {
          localStorage.removeItem(RATE_LIMIT_KEY);
        } catch {
          // ignore
        }
      }
    };

    // Check immediately on mount (handles page refresh while rate limited)
    checkRateLimit();

    // Listen for rate limit triggers from same tab
    const handleTrigger = () => checkRateLimit();
    window.addEventListener("rate-limit-triggered", handleTrigger);

    // Update countdown every second
    const interval = setInterval(checkRateLimit, 1000);

    return () => {
      window.removeEventListener("rate-limit-triggered", handleTrigger);
      clearInterval(interval);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-background/95 backdrop-blur-sm flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Slow Down!
        </h2>
        <p className="text-muted-foreground mb-4">
          You're refreshing too fast. Please wait before continuing.
        </p>
        <div className="text-4xl font-mono font-bold text-yellow-500 mb-4">
          {secondsLeft}s
        </div>
        <p className="text-sm text-muted-foreground">
          This page will unlock automatically.
        </p>
      </div>
    </div>
  );
}
