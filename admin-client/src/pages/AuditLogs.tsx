import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock } from "lucide-react";

type Tab = "admin" | "users";

interface AdminAuditLog {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  status: string;
  errorMessage: string | null;
  ipAddress: string | null;
  reason: string | null;
  createdAt: string;
}

interface UserAuditLog {
  id: number;
  email: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditResponse<T> {
  logs: T[];
  total: number;
  page: number;
  perPage: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        success
      </span>
    );
  }
  if (status === "failure") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
        <XCircle className="h-3 w-3" />
        failure
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
      <Clock className="h-3 w-3" />
      {status}
    </span>
  );
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

export default function AuditLogs() {
  const [tab, setTab] = useState<Tab>("admin");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Reset page when filters change
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleAction = (val: string) => { setActionFilter(val); setPage(1); };
  const handleStatus = (val: string) => { setStatusFilter(val); setPage(1); };
  const handleTab = (t: Tab) => { setTab(t); setPage(1); setSearch(""); setActionFilter(""); setStatusFilter(""); };

  const adminQuery = useQuery<AuditResponse<AdminAuditLog>>({
    queryKey: ["audit-admin", page, search, actionFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), perPage: "50" });
      if (search) params.set("adminEmail", search);
      if (actionFilter) params.set("action", actionFilter);
      if (statusFilter) params.set("status", statusFilter);
      return api.get(`/audit/admin?${params}`);
    },
    enabled: tab === "admin",
  });

  const userQuery = useQuery<AuditResponse<UserAuditLog>>({
    queryKey: ["audit-users", page, search, actionFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), perPage: "50" });
      if (search) params.set("email", search);
      if (actionFilter) params.set("action", actionFilter);
      return api.get(`/audit/users?${params}`);
    },
    enabled: tab === "users",
  });

  const isLoading = tab === "admin" ? adminQuery.isLoading : userQuery.isLoading;
  const isError = tab === "admin" ? adminQuery.isError : userQuery.isError;
  const total = tab === "admin" ? (adminQuery.data?.total ?? 0) : (userQuery.data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
        <button
          onClick={() => handleTab("admin")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "admin"
              ? "bg-[hsl(210_100%_50%)] text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          Admin Actions
        </button>
        <button
          onClick={() => handleTab("users")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "users"
              ? "bg-[hsl(210_100%_50%)] text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          User Events
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder={tab === "admin" ? "Filter by admin email..." : "Filter by user email..."}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(210_100%_50%)] w-64"
          />
        </div>
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => handleAction(e.target.value)}
          className="px-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[hsl(210_100%_50%)] w-48"
        />
        {tab === "admin" && (
          <select
            value={statusFilter}
            onChange={(e) => handleStatus(e.target.value)}
            className="px-4 py-2 text-sm bg-[hsl(216_28%_7%)] border border-white/10 rounded-lg text-white focus:outline-none focus:border-[hsl(210_100%_50%)]"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="pending">Pending</option>
          </select>
        )}
        <span className="flex items-center text-sm text-white/40">
          {total.toLocaleString()} records
        </span>
      </div>

      {/* Table */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(210_100%_50%)]" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-40 text-red-400 text-sm">
            Failed to load audit logs
          </div>
        ) : tab === "admin" ? (
          <AdminTable logs={adminQuery.data?.logs ?? []} />
        ) : (
          <UserTable logs={userQuery.data?.logs ?? []} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/40">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminTable({ logs }: { logs: AdminAuditLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-white/40 text-sm">
        No audit log entries found
      </div>
    );
  }

  return (
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
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
            >
              <td className="px-4 py-3 text-white/50 text-xs font-mono whitespace-nowrap">
                {formatDate(log.createdAt)}
              </td>
              <td className="px-4 py-3 text-white/80 text-xs">
                <div>{log.adminEmail}</div>
                {log.ipAddress && (
                  <div className="text-white/30 font-mono text-xs">{log.ipAddress}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <code className="text-[hsl(190_100%_60%)] text-xs bg-[hsl(190_100%_50%)/10] px-1.5 py-0.5 rounded">
                  {log.action}
                </code>
              </td>
              <td className="px-4 py-3 text-white/70 text-xs">
                {log.targetType && (
                  <span className="text-white/40 mr-1">[{log.targetType}]</span>
                )}
                {log.targetLabel || log.targetId || "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={log.status} />
              </td>
              <td className="px-4 py-3 text-white/50 text-xs max-w-xs">
                {log.errorMessage ? (
                  <span className="text-red-400">{log.errorMessage}</span>
                ) : log.reason ? (
                  log.reason
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserTable({ logs }: { logs: UserAuditLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-white/40 text-sm">
        No user audit log entries found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 text-xs text-white/40 uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-medium">Time</th>
            <th className="text-left px-4 py-3 font-medium">User</th>
            <th className="text-left px-4 py-3 font-medium">Action</th>
            <th className="text-left px-4 py-3 font-medium">Target</th>
            <th className="text-left px-4 py-3 font-medium">IP</th>
            <th className="text-left px-4 py-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
            >
              <td className="px-4 py-3 text-white/50 text-xs font-mono whitespace-nowrap">
                {formatDate(log.createdAt)}
              </td>
              <td className="px-4 py-3 text-white/80 text-xs">{log.email}</td>
              <td className="px-4 py-3">
                <code className="text-[hsl(190_100%_60%)] text-xs bg-[hsl(190_100%_50%)/10] px-1.5 py-0.5 rounded">
                  {log.action}
                </code>
              </td>
              <td className="px-4 py-3 text-white/70 text-xs">
                {log.targetType && (
                  <span className="text-white/40 mr-1">[{log.targetType}]</span>
                )}
                {log.targetId || "—"}
              </td>
              <td className="px-4 py-3 text-white/40 text-xs font-mono">
                {log.ipAddress || "—"}
              </td>
              <td className="px-4 py-3 text-white/50 text-xs max-w-xs">
                {log.details ? (
                  <span className="truncate block">
                    {typeof log.details === "string"
                      ? log.details
                      : JSON.stringify(log.details)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
