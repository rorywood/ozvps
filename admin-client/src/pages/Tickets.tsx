import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "../lib/api";
import { toast } from "sonner";
import { MessageSquare, Send, X, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const queryClient = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ["ticket-counts"],
    queryFn: ticketsApi.getCounts,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", statusFilter],
    queryFn: () => ticketsApi.list({ limit: 100, status: statusFilter || undefined }),
  });

  const { data: ticketDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["ticket", selectedTicket?.ticket?.id],
    queryFn: () => ticketsApi.get(selectedTicket.ticket.id),
    enabled: !!selectedTicket?.ticket?.id,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      ticketsApi.addMessage(id, message),
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["ticket", selectedTicket?.ticket?.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => ticketsApi.close(id),
    onSuccess: () => {
      toast.success("Ticket closed");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-counts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: number) => ticketsApi.reopen(id),
    onSuccess: () => {
      toast.success("Ticket reopened");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-counts"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", selectedTicket?.ticket?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => ticketsApi.update(id, data),
    onSuccess: () => {
      toast.success("Ticket updated");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", selectedTicket?.ticket?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ticketsApi.delete(id),
    onSuccess: () => {
      toast.success("Ticket deleted");
      setSelectedTicket(null);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-counts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
      normal: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      high: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
    };
    return colors[priority] || colors.normal;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
      open: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      waiting_user: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      waiting_admin: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
      resolved: "bg-green-500/20 text-green-400 border border-green-500/30",
      closed: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
    };
    return colors[status] || colors.open;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Support Tickets</h1>
        <div className="flex gap-2 flex-wrap">
          {counts?.counts && Object.entries(counts.counts).map(([status, count]) => (
            <span key={status} className={`px-3 py-1 rounded-lg text-sm ${getStatusColor(status)}`}>
              {status}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
            >
              <option value="">All Statuses</option>
              <option value="open">Open (not closed)</option>
              <option value="new">New</option>
              <option value="waiting_admin">Waiting Admin</option>
              <option value="waiting_user">Waiting User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {tickets?.tickets?.map((item: any) => (
                  <button
                    key={item.ticket.id}
                    onClick={() => setSelectedTicket(item)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedTicket?.ticket?.id === item.ticket.id
                        ? "bg-blue-500/10 border border-blue-500/30 dark:bg-blue-500/20"
                        : "bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{item.ticket.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.user?.email}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-lg flex-shrink-0 ${getPriorityColor(item.ticket.priority)}`}>
                        {item.ticket.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-1 text-xs rounded-lg ${getStatusColor(item.ticket.status)}`}>
                        {item.ticket.status.replace("_", " ")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.ticket.lastMessageAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
                {(!tickets?.tickets || tickets.tickets.length === 0) && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">No tickets found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ticket Details */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedTicket.ticket.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedTicket.user?.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Created: {new Date(selectedTicket.ticket.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedTicket.ticket.status === "closed" || selectedTicket.ticket.status === "resolved") && (
                    <button
                      onClick={() => reopenMutation.mutate(selectedTicket.ticket.id)}
                      disabled={reopenMutation.isPending}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                      title="Reopen ticket"
                    >
                      <RotateCcw className="h-5 w-5" />
                    </button>
                  )}
                  {selectedTicket.ticket.status !== "closed" && (
                    <button
                      onClick={() => closeMutation.mutate(selectedTicket.ticket.id)}
                      disabled={closeMutation.isPending}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                      title="Close ticket"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this ticket? This action cannot be undone.")) {
                        deleteMutation.mutate(selectedTicket.ticket.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete ticket"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Ticket Controls */}
              <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
                  <select
                    value={selectedTicket.ticket.status}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      setSelectedTicket({ ...selectedTicket, ticket: { ...selectedTicket.ticket, status: newStatus } });
                      updateMutation.mutate({ id: selectedTicket.ticket.id, data: { status: newStatus } });
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
                  >
                    <option value="new">New</option>
                    <option value="open">Open</option>
                    <option value="waiting_user">Waiting User</option>
                    <option value="waiting_admin">Waiting Admin</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                  <select
                    value={selectedTicket.ticket.priority}
                    onChange={(e) => {
                      const newPriority = e.target.value;
                      setSelectedTicket({ ...selectedTicket, ticket: { ...selectedTicket.ticket, priority: newPriority } });
                      updateMutation.mutate({ id: selectedTicket.ticket.id, data: { priority: newPriority } });
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Category</label>
                  <select
                    value={selectedTicket.ticket.category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      setSelectedTicket({ ...selectedTicket, ticket: { ...selectedTicket.ticket, category: newCategory } });
                      updateMutation.mutate({ id: selectedTicket.ticket.id, data: { category: newCategory } });
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
                  >
                    <option value="general">General</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                    <option value="sales">Sales</option>
                    <option value="abuse">Abuse</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              {loadingDetails ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto mb-4 border-t border-b border-gray-200 dark:border-gray-700 py-4">
                  {ticketDetails?.messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg ${
                        msg.authorType === "admin"
                          ? "bg-blue-500/10 dark:bg-blue-500/20 ml-8"
                          : "bg-gray-50 dark:bg-gray-800/50 mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {msg.authorName || msg.authorEmail}
                          {msg.authorType === "admin" && (
                            <span className="ml-2 text-xs text-blue-500">(Admin)</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply */}
              {selectedTicket.ticket.status !== "closed" && (
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900 dark:text-white placeholder-gray-500"
                  />
                  <button
                    onClick={() => {
                      if (replyText.trim()) {
                        replyMutation.mutate({ id: selectedTicket.ticket.id, message: replyText });
                      }
                    }}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              )}

              {/* Closed ticket notice */}
              {selectedTicket.ticket.status === "closed" && (
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    This ticket is closed. Click the reopen button to resume the conversation.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-12 text-center">
              <div className="inline-flex p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
