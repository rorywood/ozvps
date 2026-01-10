import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface PendingAction {
  action: string;
  timestamp: number;
}

interface PendingActionsMap {
  [serverId: string]: PendingAction;
}

interface PowerActionContextType {
  pendingActions: PendingActionsMap;
  markPending: (serverId: string, action: string) => void;
  clearPending: (serverId: string) => void;
  isPending: (serverId: string) => boolean;
  getPendingAction: (serverId: string) => string | null;
  getDisplayStatus: (serverId: string, actualStatus: string) => string;
}

const STORAGE_KEY = "ozvps_pending_power_actions";
const ACTION_TIMEOUT_MS = 5 * 60 * 1000;

const PowerActionContext = createContext<PowerActionContextType | null>(null);

function loadFromStorage(): PendingActionsMap {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PendingActionsMap;
      const now = Date.now();
      const filtered: PendingActionsMap = {};
      for (const [serverId, action] of Object.entries(parsed)) {
        if (now - action.timestamp < ACTION_TIMEOUT_MS) {
          filtered[serverId] = action;
        }
      }
      return filtered;
    }
  } catch (e) {
  }
  return {};
}

function saveToStorage(actions: PendingActionsMap) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  } catch (e) {
  }
}

export function PowerActionProvider({ children }: { children: ReactNode }) {
  const [pendingActions, setPendingActions] = useState<PendingActionsMap>(loadFromStorage);

  useEffect(() => {
    saveToStorage(pendingActions);
  }, [pendingActions]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPendingActions((prev) => {
        const filtered: PendingActionsMap = {};
        let changed = false;
        for (const [serverId, action] of Object.entries(prev)) {
          if (now - action.timestamp < ACTION_TIMEOUT_MS) {
            filtered[serverId] = action;
          } else {
            changed = true;
          }
        }
        return changed ? filtered : prev;
      });
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const markPending = useCallback((serverId: string, action: string) => {
    setPendingActions((prev) => ({
      ...prev,
      [serverId]: { action, timestamp: Date.now() },
    }));
  }, []);

  const clearPending = useCallback((serverId: string) => {
    setPendingActions((prev) => {
      const { [serverId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const isPending = useCallback((serverId: string) => {
    return serverId in pendingActions;
  }, [pendingActions]);

  const getPendingAction = useCallback((serverId: string): string | null => {
    return pendingActions[serverId]?.action || null;
  }, [pendingActions]);

  const getDisplayStatus = useCallback((serverId: string, actualStatus: string): string => {
    const pending = pendingActions[serverId];
    if (!pending) return actualStatus;

    const actionToStatus: Record<string, string> = {
      reboot: "rebooting",
      shutdown: "stopping",
      start: "starting",
    };

    const expectedStatus = actionToStatus[pending.action];
    if (!expectedStatus) return actualStatus;

    if (pending.action === "reboot" && actualStatus === "running") {
      const timeSinceAction = Date.now() - pending.timestamp;
      if (timeSinceAction > 30000) {
        return actualStatus;
      }
    }

    if (pending.action === "start" && actualStatus === "running") {
      return actualStatus;
    }

    if (pending.action === "shutdown" && actualStatus === "stopped") {
      return actualStatus;
    }

    return expectedStatus;
  }, [pendingActions]);

  return (
    <PowerActionContext.Provider
      value={{
        pendingActions,
        markPending,
        clearPending,
        isPending,
        getPendingAction,
        getDisplayStatus,
      }}
    >
      {children}
    </PowerActionContext.Provider>
  );
}

export function usePowerActions() {
  const context = useContext(PowerActionContext);
  if (!context) {
    throw new Error("usePowerActions must be used within a PowerActionProvider");
  }
  return context;
}

export function useSyncPowerActions(servers: Array<{ id: string; status: string }> | undefined) {
  const { pendingActions, clearPending } = usePowerActions();

  useEffect(() => {
    if (!servers) return;

    for (const server of servers) {
      const pending = pendingActions[server.id];
      if (!pending) continue;

      const timeSinceAction = Date.now() - pending.timestamp;

      // For reboot: wait at least 10 seconds AND status is running
      // (prevents clearing too early when server goes from running -> stopped -> running)
      if (pending.action === "reboot" && server.status === "running" && timeSinceAction > 10000) {
        clearPending(server.id);
      }

      // For start: just check if status is running (no minimum time needed)
      if (pending.action === "start" && server.status === "running") {
        clearPending(server.id);
      }

      // For shutdown: just check if status is stopped (no minimum time needed)
      if (pending.action === "shutdown" && server.status === "stopped") {
        clearPending(server.id);
      }

      // Clear if action takes longer than 5 minutes (failsafe)
      if (timeSinceAction > ACTION_TIMEOUT_MS) {
        clearPending(server.id);
      }
    }
  }, [servers, pendingActions, clearPending]);
}
