import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activityApi, api } from "../lib/api";
import { toast } from "sonner";
import { WifiOff, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Search } from "lucide-react";

type Tab = "online" | "logins" | "feed" | "admin";

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseDevice(ua: string): string {
  if (!ua) return "Unknown";
  const browser =
    ua.includes("Edg")
      ? "Edge"
      : ua.includes("Chrome") && !ua.includes("Edg")
      ? "Chrome"
      : ua.includes("Firefox")
      ? "Firefox"
      : ua.includes("Safari") && !ua.includes("Chrome")
      ? "Safari"
      : "Browser";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac")
    ? "macOS"
    : ua.includes("Linux")
    ? "Linux"
    : ua.includes("Android")
    ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad")
    ? "iOS"
    : "Unknown OS";
  return `${browser} / ${os}`;
}

// ── action badge ─────────────────────────────────────────────────────────────

const AUTH_ACTIONS = new Set([
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "login_success",
  "login_failure",
  "logout",
]);
const SECURITY_ACTIONS = new Set([
  "PASSWORD_CHANGE",
  "TWO_FA_ENABLE",
  "TWO_FA_DISABLE",
  "EMAIL_CHANGE",
  "password_change",
  "two_fa_enable",
  "two_fa_disable",
  "email_change",
]);
const SERVER_ACTIONS = new Set([
  "SERVER_CREATE",
  "SERVER_CANCEL",
  "SERVER_DELETE",
  "SERVER_REINSTALL",
  "server_create",
  "server_cancel",
  "server_delete",
  "server_reinstall",
]);

function ActionBadge({ action }: { action: string }) {
  let colorClass = "bg-white/10 text-white/50";
  if (AUTH_ACTIONS.has(action)) colorClass = "bg-[hsl(210_100%_50%)/15] text-[hsl(210_100%_65%)]";
  else if (SECURITY_ACTIONS.has(action)) colorClass = "bg-[hsl(45_100%_51%)/15] text-[hsl(45_100%_60%)]";
  else if (SERVER_ACTIONS.has(action)) colorClass = "bg-purple-500/15 text-purple-300";

  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium ${colorClass}`}>
      {action}
    </span>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────────

const LOGIN_ACTIONS = new Set([
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "login_success",
  "login_failure",
]);

// ── Online Now tab ────────────────────────────────────────────────────────────

function OnlineNowTab() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["activity-sessions-online"],
    queryFn: () => activityApi.getSessions(true),
    refetchInterval: 15000,
  });

  const sessions = data?.sessions ?? [];

  async function handleRevoke(sessionId: string) {
    try {
      await activityApi.revokeSession(sessionId);
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey: ["activity-sessions-online"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke session");
    }
  }

  return (
    <div className="space-y-4">
      {/* count badge */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[hsl(160_84%_39%)] animate-pulse" />
        <span className="text-sm text-white/60">
          {isLoading ? "Loading..." : `${sessions.length} user${sessions.length !== 1 ? "s" : ""} online`}
        </span>
      </div>

      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(210_100%_50%)]" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-40 text-red-400 text-sm">
            Failed to load sessions
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/30">
            <WifiOff className="h-6 w-6" />
            <span className="text-sm">No users online</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-white/40 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">IP Address</th>
                  <th className="text-left px-4 py-3 font-medium">Device</th>
                  <th className="text-left px-4 py-3 font-medium">Session started</th>
                  <th className="text-left px-4 py-3 font-medium">Last active</th>
                  <th className="text-left px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any) => (
                  <tr
                    key={s.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-white text-xs font-medium">{s.name || s.email}</div>
                      {s.name && (
                        <div className="text-white/40 text-xs">{s.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">
                      {s.ipAddress || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/60">
                      {parseDevice(s.userAgent || "")}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/50">
                      {timeAgo(s.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-[hsl(160_84%_60%)]">
                        {s.lastActiveAt ? timeAgo(s.lastActiveAt) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevoke(s.id)}
                        className="px-3 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recent Logins tab ─────────────────────────────────────────────────────────

function RecentLoginsTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["activity-feed-logins"],
    queryFn: () => activityApi.getFeed(200),
    refetchInterval: 30000,
  });

  const events = (data?.events ?? []).filter((e: any) => LOGIN_ACTIONS.has(e.action));

  return (
    <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(210_100%_50%)]" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-40 text-red-400 text-sm">
          Failed to load login events
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm">
          No login events found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-xs text-white/40 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Time</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Result</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
                <th className="text-left px-4 py-3 font-medium">Device</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => {
                const isSuccess =
                  e.action === "LOGIN_SUCCESS" || e.action === "login_success";
                return (
                  <tr
                    key={e.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3 text-white/50 text-xs font-mono whitespace-nowrap">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-white/80 text-xs">{e.email}</td>
                    <td className="px-4 py-3">
                      {isSuccess ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-[hsl(160_84%_60%)]">
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-[hsl(0_84%_70%)]">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/50">
                      {e.ipAddress || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/50">
                      {e.details?.userAgent
                        ? parseDevice(e.details.userAgent)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Activity Feed tab ─────────────────────────────────────────────────────────

function ActivityFeedTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: () => activityApi.getFeed(100),
    refetchInterval: 15000,
  });

  const events = data?.events ?? [];

  return (
    <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(210_100%_50%)]" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-40 text-red-400 text-sm">
          Failed to load activity feed
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm">
          No activity yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-xs text-white/40 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => (
                <tr
                  key={e.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                >
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {timeAgo(e.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">{e.email}</td>
                  <td className="px-4 py-3">
                    <ActionBadge action={e.action} />
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {e.targetType && (
                      <span className="text-white/30 mr-1">[{e.targetType}]</span>
                    )}
                    {e.targetId || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">
                    {e.ipAddress || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Admin Actions tab ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-[hsl(160_84%_60%)]">
      <CheckCircle className="h-3 w-3" />success
    </span>
  );
  if (status === "failure") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-[hsl(0_84%_70%)]">
      <XCircle className="h-3 w-3" />failure
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(45_100%_51%)/15] text-[hsl(45_100%_60%)]">
      <Clock className="h-3 w-3" />{status}
    </span>
  );
}

function AdminActionsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-admin", page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), perPage: "50" });
      if (debouncedSearch) params.set("adminEmail", debouncedSearch);
      return api.get<{ logs: any[]; total: number }>(`/audit/admin?${params}`);
    },
    refetchInterval: 30000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    // simple debounce
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => setDebouncedSearch(val), 300);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            placeholder="Filter by admin email..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(210_100%_50%)] w-64"
          />
        </div>
        <span className="text-xs text-white/30">{total.toLocaleString()} records</span>
      </div>

      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(210_100%_50%)]" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-40 text-red-400 text-sm">Failed to load admin actions</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-white/30 text-sm">No admin actions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-white/40 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                  <th className="text-left px-4 py-3 font-medium">Admin</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Reason / Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-white/50 text-xs font-mono whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-white/80">{log.adminEmail}</div>
                      {log.ipAddress && <div className="text-white/30 font-mono">{log.ipAddress}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[hsl(190_100%_60%)] text-xs bg-[hsl(190_100%_50%)/10] px-1.5 py-0.5 rounded">{log.action}</code>
                    </td>
                    <td className="px-4 py-3 text-white/70 text-xs">
                      {log.targetType && <span className="text-white/40 mr-1">[{log.targetType}]</span>}
                      {log.targetLabel || log.targetId || "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 text-xs max-w-xs">
                      {log.errorMessage ? <span className="text-red-400">{log.errorMessage}</span> : log.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Activity() {
  const [tab, setTab] = useState<Tab>("online");

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
        {(["online", "logins", "feed", "admin"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? "bg-[hsl(210_100%_50%)] text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t === "online" ? "Online Now" : t === "logins" ? "Recent Logins" : t === "feed" ? "Activity Feed" : "Admin Actions"}
          </button>
        ))}
      </div>

      {tab === "online" && <OnlineNowTab />}
      {tab === "logins" && <RecentLoginsTab />}
      {tab === "feed" && <ActivityFeedTab />}
      {tab === "admin" && <AdminActionsTab />}
    </div>
  );
}
