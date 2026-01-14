import { useState, useEffect } from "react";

const STORAGE_KEY = "dev-banner-dismissed";
const EVENT_NAME = "dev-banner-state-change";

export function useDevBannerState() {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const dismissed = localStorage.getItem(STORAGE_KEY) === "true";
      setIsDismissed(dismissed);
    };

    window.addEventListener(EVENT_NAME, handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(EVENT_NAME, handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const setDismissed = (dismissed: boolean) => {
    setIsDismissed(dismissed);
    if (typeof window !== "undefined") {
      if (dismissed) {
        localStorage.setItem(STORAGE_KEY, "true");
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  };

  return { isDismissed, setDismissed };
}
