import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AdminLayout } from "../layout/AdminLayout";
import {
  MessageSquare, RefreshCw, Loader2, ShieldCheck, User, Server, Tag, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AdminTickets() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("new,waiting_admin");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyStatus, setReplyStatus] = useState<string>("waiting_user");

  // Queries
  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['admin', 'tickets', statusFilter, categoryFilter, priorityFilter],
    queryFn: () => api.getAdminTickets({
      status: statusFilter === 'all' ? undefined : statusFilter.split(','),
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
    }),
  });

  const { data: ticketDetail, isLoading: ticketDetailLoading } = useQuery({
    queryKey: ['admin', 'ticket', selectedTicketId],
    queryFn: () => api.getAdminTicket(selectedTicketId!),
    enabled: !!selectedTicketId,
  });

  const { data: countsData } = useQuery({
    queryKey: ['admin', 'tickets', 'counts'],
    queryFn: () => api.getAdminTicketCounts(),
  });

  // Mutations
  const replyMutation = useMutation({
    mutationFn: ({ id, message, status }: { id: number; message: string; status?: string }) =>
      api.adminReplyToTicket(id, message, status),
    onSuccess: () => {
      toast.success('Reply sent successfully');
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', selectedTicketId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Record<string, unknown> }) =>
      api.updateAdminTicket(id, updates),
    onSuccess: () => {
      toast.success('Ticket updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', selectedTicketId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.adminCloseTicket(id),
    onSuccess: () => {
      toast.success('Ticket closed');
      setSelectedTicketId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.adminDeleteTicket(id),
    onSuccess: () => {
      toast.success('Ticket deleted');
      setSelectedTicketId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Helpers
  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyMessage.trim()) return;
    replyMutation.mutate({ id: selectedTicketId, message: replyMessage, status: replyStatus });
  };

  const categoryLabels: Record<string, string> = {
    sales: "Sales",
    accounts: "Accounts",
    support: "Support",
    abuse: "Abuse",
  };

  const priorityLabels: Record<string, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    new: { label: "New", color: "bg-blue-500/20 text-blue-400" },
    open: { label: "Open", color: "bg-cyan-500/20 text-cyan-400" },
    waiting_user: { label: "Waiting on User", color: "bg-amber-500/20 text-amber-400" },
    waiting_admin: { label: "Waiting on Admin", color: "bg-purple-500/20 text-purple-400" },
    resolved: { label: "Resolved", color: "bg-green-500/20 text-green-400" },
    closed: { label: "Closed", color: "bg-slate-500/20 text-slate-400" },
  };

  const priorityColors: Record<string, string> = {
    low: "text-slate-500",
    normal: "text-white",
    high: "text-amber-400",
    urgent: "text-red-400",
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else {
      return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    }
  };

  const tickets = ticketsData?.tickets || [];

  return (
    <AdminLayout title="Admin - Tickets">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Tickets</h1>
            <p className="text-slate-400 mt-1">Support ticket management</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
            <p className="text-2xl font-bold text-blue-400">{countsData?.new || 0}</p>
            <p className="text-xs text-slate-500">New</p>
          </div>
          <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
            <p className="text-2xl font-bold text-purple-400">{countsData?.waitingAdmin || 0}</p>
            <p className="text-xs text-slate-500">Awaiting Response</p>
          </div>
          <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
            <p className="text-2xl font-bold text-white">{countsData?.open || 0}</p>
            <p className="text-xs text-slate-500">Open</p>
          </div>
          <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-3">
            <p className="text-2xl font-bold text-slate-400">{countsData?.total || 0}</p>
            <p className="text-xs text-slate-500">Total</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="new,waiting_admin">Needs Attention</option>
            <option value="new">New Only</option>
            <option value="waiting_admin">Waiting on Admin</option>
            <option value="waiting_user">Waiting on User</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="all">All Tickets</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="all">All Categories</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="all">All Priorities</option>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchTickets()}
            className="ml-auto border-white/10 text-slate-300 hover:text-white"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Ticket List & Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ticket List */}
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
            <div className="p-3 border-b border-white/5">
              <h3 className="font-medium text-white flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Tickets ({tickets.length})
              </h3>
            </div>
            {ticketsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No tickets match the current filters
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
                {tickets.map((ticket: any) => (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedTicketId === ticket.id ? 'bg-amber-500/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-500">#{ticket.id}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusLabels[ticket.status]?.color || ''}`}>
                        {statusLabels[ticket.status]?.label || ticket.status}
                      </span>
                      <span className={`text-xs font-medium ${priorityColors[ticket.priority] || ''}`}>
                        {priorityLabels[ticket.priority] || ticket.priority}
                      </span>
                    </div>
                    <p className="font-medium text-white text-sm truncate">{ticket.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>{categoryLabels[ticket.category] || ticket.category}</span>
                      <span>•</span>
                      <span>{formatDate(ticket.lastMessageAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ticket Detail */}
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
            {!selectedTicketId ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-10 w-10 text-slate-600 mb-3" />
                <p className="text-slate-500">Select a ticket to view details</p>
              </div>
            ) : ticketDetailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              </div>
            ) : ticketDetail ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-3 border-b border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">#{ticketDetail.ticket.id}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={ticketDetail.ticket.status}
                        onChange={(e) => updateMutation.mutate({ id: ticketDetail.ticket.id, updates: { status: e.target.value } })}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="new">New</option>
                        <option value="open">Open</option>
                        <option value="waiting_user">Waiting on User</option>
                        <option value="waiting_admin">Waiting on Admin</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                      <select
                        value={ticketDetail.ticket.priority}
                        onChange={(e) => updateMutation.mutate({ id: ticketDetail.ticket.id, updates: { priority: e.target.value } })}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <h3 className="font-medium text-white">{ticketDetail.ticket.title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {categoryLabels[ticketDetail.ticket.category] || ticketDetail.ticket.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ticketDetail.ticket.auth0UserId.split('|').pop()?.slice(0, 12)}...
                    </span>
                    {ticketDetail.server && (
                      <span className="flex items-center gap-1">
                        <Server className="h-3 w-3" />
                        {ticketDetail.server.name || ticketDetail.server.hostname}
                      </span>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 max-h-[250px] overflow-y-auto p-3 space-y-3">
                  {ticketDetail.messages.map((message: any) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${message.authorType === 'admin' ? 'flex-row-reverse' : ''}`}
                    >
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.authorType === 'admin' ? 'bg-amber-500/20' : 'bg-cyan-500/20'
                        }`}
                      >
                        {message.authorType === 'admin' ? (
                          <ShieldCheck className="h-3 w-3 text-amber-400" />
                        ) : (
                          <User className="h-3 w-3 text-cyan-400" />
                        )}
                      </div>
                      <div className={`flex-1 max-w-[80%] ${message.authorType === 'admin' ? 'text-right' : ''}`}>
                        <div className="text-[10px] text-slate-500 mb-0.5">
                          {message.authorName || message.authorEmail.split('@')[0]} • {formatDate(message.createdAt)}
                        </div>
                        <div
                          className={`rounded-lg p-2 text-xs ${
                            message.authorType === 'admin' ? 'bg-amber-500/10' : 'bg-white/5'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-white">{message.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                {ticketDetail.ticket.status !== 'closed' && (
                  <div className="p-3 border-t border-white/5">
                    <form onSubmit={handleReplySubmit} className="space-y-2">
                      <Textarea
                        placeholder="Type your reply..."
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        rows={2}
                        className="text-sm bg-white/5 border-white/10 text-white"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={replyStatus}
                          onChange={(e) => setReplyStatus(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white flex-1"
                        >
                          <option value="waiting_user">Set: Waiting on User</option>
                          <option value="open">Set: Open</option>
                          <option value="resolved">Set: Resolved</option>
                        </select>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!replyMessage.trim() || replyMutation.isPending}
                          className="bg-amber-500 hover:bg-amber-600 text-black"
                        >
                          {replyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-1" />
                              Reply
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Actions */}
                <div className="p-3 border-t border-white/5 flex justify-between">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to permanently delete this ticket? This cannot be undone.')) {
                        deleteMutation.mutate(ticketDetail.ticket.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                  </Button>
                  {ticketDetail.ticket.status !== 'closed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => closeMutation.mutate(ticketDetail.ticket.id)}
                      disabled={closeMutation.isPending}
                      className="border-white/10 text-slate-300"
                    >
                      {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Close Ticket'}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                Ticket not found
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
