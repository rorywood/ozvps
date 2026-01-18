import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Global state for rate limit
let rateLimitedUntil: number | null = null;
let listeners: Set<() => void> = new Set();

export function triggerRateLimit(seconds: number = 10) {
  rateLimitedUntil = Date.now() + seconds * 1000;
  listeners.forEach(fn => fn());
}

export function isRateLimited(): boolean {
  return rateLimitedUntil !== null && Date.now() < rateLimitedUntil;
}

export function RateLimitOverlay() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkRateLimit = () => {
      if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
        setVisible(true);
        setSecondsLeft(Math.ceil((rateLimitedUntil - Date.now()) / 1000));
      } else {
        setVisible(false);
        rateLimitedUntil = null;
      }
    };

    // Subscribe to rate limit changes
    listeners.add(checkRateLimit);
    checkRateLimit();

    // Update countdown every second
    const interval = setInterval(checkRateLimit, 1000);

    return () => {
      listeners.delete(checkRateLimit);
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
