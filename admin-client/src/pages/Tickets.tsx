import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "../lib/api";
import { toast } from "sonner";
import { MessageSquare, Send, X, RefreshCw } from "lucide-react";

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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-100 text-gray-800",
      normal: "bg-blue-100 text-blue-800",
      high: "bg-yellow-100 text-yellow-800",
      urgent: "bg-red-100 text-red-800",
    };
    return colors[priority] || colors.normal;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-purple-100 text-purple-800",
      open: "bg-blue-100 text-blue-800",
      waiting_user: "bg-yellow-100 text-yellow-800",
      waiting_admin: "bg-orange-100 text-orange-800",
      resolved: "bg-green-100 text-green-800",
      closed: "bg-gray-100 text-gray-800",
    };
    return colors[status] || colors.open;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        <div className="flex gap-2">
          {counts?.counts && Object.entries(counts.counts).map(([status, count]) => (
            <span key={status} className={`px-3 py-1 rounded-full text-sm ${getStatusColor(status)}`}>
              {status}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg"
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
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedTicket?.ticket?.id === item.ticket.id
                        ? "bg-blue-50 border border-blue-200"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.ticket.title}</p>
                        <p className="text-sm text-gray-500">{item.user?.email}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${getPriorityColor(item.ticket.priority)}`}>
                        {item.ticket.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(item.ticket.status)}`}>
                        {item.ticket.status.replace("_", " ")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.ticket.lastMessageAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
                {(!tickets?.tickets || tickets.tickets.length === 0) && (
                  <p className="text-center text-gray-500 py-4">No tickets found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ticket Details */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedTicket.ticket.title}</h2>
                  <p className="text-sm text-gray-500">{selectedTicket.user?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full ${getStatusColor(selectedTicket.ticket.status)}`}>
                    {selectedTicket.ticket.status.replace("_", " ")}
                  </span>
                  {selectedTicket.ticket.status !== "closed" && (
                    <button
                      onClick={() => closeMutation.mutate(selectedTicket.ticket.id)}
                      className="p-2 text-gray-500 hover:text-red-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              {loadingDetails ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto mb-4 border-t border-b py-4">
                  {ticketDetails?.messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg ${
                        msg.authorType === "admin" ? "bg-blue-50 ml-8" : "bg-gray-50 mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">
                          {msg.authorName || msg.authorEmail}
                          {msg.authorType === "admin" && (
                            <span className="ml-2 text-xs text-blue-600">(Admin)</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{msg.message}</p>
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
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                  <button
                    onClick={() => {
                      if (replyText.trim()) {
                        replyMutation.mutate({ id: selectedTicket.ticket.id, message: replyText });
                      }
                    }}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
