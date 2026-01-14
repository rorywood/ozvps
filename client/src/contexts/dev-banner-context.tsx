import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface DevBannerContextType {
  isDismissed: boolean;
  setDismissed: (dismissed: boolean) => void;
}

const DevBannerContext = createContext<DevBannerContextType | undefined>(undefined);

export function DevBannerProvider({ children }: { children: ReactNode }) {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dev-banner-dismissed") === "true";
    }
    return false;
  });

  const setDismissed = (dismissed: boolean) => {
    setIsDismissed(dismissed);
    if (typeof window !== "undefined") {
      if (dismissed) {
        localStorage.setItem("dev-banner-dismissed", "true");
      } else {
        localStorage.removeItem("dev-banner-dismissed");
      }
    }
  };

  return (
    <DevBannerContext.Provider value={{ isDismissed, setDismissed }}>
      {children}
    </DevBannerContext.Provider>
  );
}

export function useDevBanner() {
  const context = useContext(DevBannerContext);
  if (context === undefined) {
    throw new Error("useDevBanner must be used within a DevBannerProvider");
  }
  return context;
}
