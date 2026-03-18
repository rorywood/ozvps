import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi, usersApi } from "../lib/api";
import { toast } from "sonner";
import {
  MessageSquare, Send, X, RefreshCw, RotateCcw, Trash2, Search,
  Lock, Eye, EyeOff, Loader2, ChevronDown, StickyNote, Clock,
  AlertTriangle, Tag, User, Plus,
} from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Select } from "../components/ui/select";
import { AdminPageHeader } from "../components/ui/admin-surfaces";

// ── Canned responses ──────────────────────────────────────────────────────────
const CANNED_RESPONSES = [
  { label: "Greeting", text: "Hi there,\n\nThank you for getting in touch with OzVPS support. I'd be happy to help you with this.\n\n" },
  { label: "Need more info", text: "Thanks for reaching out. Could you please provide some additional details so I can assist you better?\n\n- What steps have you already tried?\n- Any error messages you're seeing?\n\nLooking forward to hearing from you." },
  { label: "Issue resolved", text: "I'm glad to let you know that this issue has been resolved. Please don't hesitate to reach out if you need anything else.\n\nHave a great day!" },
  { label: "Escalating", text: "Thank you for your patience. I've escalated this to our technical team and will follow up once we have an update for you.\n\nWe'll be in touch as soon as possible." },
  { label: "Closing", text: "As we haven't heard back from you, we'll be closing this ticket. Please open a new ticket if you need further assistance." },
  { label: "Abuse acknowledged", text: "Thank you for reporting this. We take abuse reports seriously and will investigate promptly.\n\nWe'll update you on the outcome once our review is complete." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_STYLES: Record<string, string> = {
  low:    "bg-white/8 text-white/40 border-white/10",
  normal: "bg-[hsl(210_100%_50%)/12] text-[hsl(210_100%_70%)] border-[hsl(210_100%_50%)/20]",
  high:   "bg-[hsl(14_100%_60%)/12] text-[hsl(14_100%_70%)] border-[hsl(14_100%_60%)/20]",
  urgent: "bg-[hsl(0_84%_60%)/12] text-[hsl(0_84%_70%)] border-[hsl(0_84%_60%)/20]",
};

const STATUS_STYLES: Record<string, string> = {
  new:           "bg-[hsl(270_70%_60%)/12] text-[hsl(270_70%_70%)] border-[hsl(270_70%_60%)/20]",
  open:          "bg-[hsl(210_100%_50%)/12] text-[hsl(210_100%_70%)] border-[hsl(210_100%_50%)/20]",
  waiting_user:  "bg-[hsl(14_100%_60%)/12] text-[hsl(14_100%_70%)] border-[hsl(14_100%_60%)/20]",
  waiting_admin: "bg-[hsl(45_100%_51%)/12] text-[hsl(45_100%_60%)] border-[hsl(45_100%_51%)/20]",
  resolved:      "bg-[hsl(160_84%_39%)/12] text-[hsl(160_84%_60%)] border-[hsl(160_84%_39%)/20]",
  closed:        "bg-white/5 text-white/35 border-white/8",
};

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales", support: "Support", accounts: "Accounts", abuse: "Abuse",
};

function statusLabel(s: string) {
  return s === "waiting_user" ? "Waiting User"
    : s === "waiting_admin" ? "Waiting Admin"
    : s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const cannedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // New ticket on behalf of user
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicketUserSearch, setNewTicketUserSearch] = useState("");
  const [newTicketSelectedUser, setNewTicketSelectedUser] = useState<any>(null);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketCategory, setNewTicketCategory] = useState("support");
  const [newTicketPriority, setNewTicketPriority] = useState("normal");
  const [newTicketMessage, setNewTicketMessage] = useState("");

  // Close canned dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cannedRef.current && !cannedRef.current.contains(e.target as Node)) {
        setShowCanned(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll to bottom of messages when ticket changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedTicket?.ticket?.id]);

  const { data: counts } = useQuery({
    queryKey: ["ticket-counts"],
    queryFn: ticketsApi.getCounts,
    refetchInterval: 30000,
  });

  const { data: tickets, isLoading, refetch } = useQuery({
    queryKey: ["tickets", statusFilter],
    queryFn: () => ticketsApi.list({ limit: 200, status: statusFilter || undefined }),
    refetchInterval: 30000,
  });

  const { data: ticketDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["ticket", selectedTicket?.ticket?.id],
    queryFn: () => ticketsApi.get(selectedTicket.ticket.id),
    enabled: !!selectedTicket?.ticket?.id,
    refetchInterval: 15000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message, note }: { id: number; message: string; note: boolean }) =>
      ticketsApi.addMessage(id, message, note),
    onSuccess: () => {
      toast.success(isInternalNote ? "Note added" : "Reply sent");
      setReplyText("");
      setIsInternalNote(false);
      queryClient.invalidateQueries({ queryKey: ["ticket", selectedTicket?.ticket?.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets", statusFilter] });
      queryClient.invalidateQueries({ queryKey: ["ticket-counts"] });
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
      queryClient.invalidateQueries({ queryKey: ["tickets", statusFilter] });
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

  const { data: userSearchResults, isLoading: searchingUsers } = useQuery({
    queryKey: ["user-search", newTicketUserSearch],
    queryFn: () => usersApi.search(newTicketUserSearch),
    enabled: newTicketUserSearch.trim().length >= 2,
  });

  const createOnBehalfMutation = useMutation({
    mutationFn: ticketsApi.createOnBehalf,
    onSuccess: (data) => {
      toast.success(`Ticket #${data.ticket.ticketNumber} created — email sent to user`);
      setShowNewTicket(false);
      setNewTicketSelectedUser(null);
      setNewTicketUserSearch("");
      setNewTicketTitle("");
      setNewTicketCategory("support");
      setNewTicketPriority("normal");
      setNewTicketMessage("");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-counts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreateOnBehalf = () => {
    if (!newTicketSelectedUser || !newTicketTitle.trim() || !newTicketMessage.trim()) return;
    createOnBehalfMutation.mutate({
      auth0UserId: newTicketSelectedUser.auth0UserId,
      title: newTicketTitle.trim(),
      category: newTicketCategory,
      priority: newTicketPriority,
      message: newTicketMessage.trim(),
    });
  };

  const handleSend = () => {
    if (!replyText.trim() || !selectedTicket) return;
    replyMutation.mutate({ id: selectedTicket.ticket.id, message: replyText, note: isInternalNote });
  };

  const handleUpdate = (field: string, value: string) => {
    if (!selectedTicket) return;
    setSelectedTicket({ ...selectedTicket, ticket: { ...selectedTicket.ticket, [field]: value } });
    updateMutation.mutate({ id: selectedTicket.ticket.id, data: { [field]: value } });
  };

  // Filter tickets by search
  const filteredTickets = tickets?.tickets?.filter((item: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.ticket.title?.toLowerCase().includes(q) ||
      item.user?.email?.toLowerCase().includes(q) ||
      item.user?.name?.toLowerCase().includes(q) ||
      String(item.ticket.ticketNumber)?.includes(q)
    );
  }) ?? [];

  const ticket = selectedTicket?.ticket;

  return (
    <div>
      <AdminPageHeader
        title="Support Tickets"
        description="Work active conversations faster, keep notes internal when needed, and keep queue status visible at a glance."
        actions={
          <>
          <button
            onClick={() => setShowNewTicket(true)}
            className="flex items-center gap-2 rounded-xl bg-[hsl(210_100%_50%)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[hsl(210_100%_45%)]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Ticket
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          </>
        }
      />

      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {counts?.counts && Object.entries(counts.counts).map(([status, count]) => (
          count > 0 && (
            <span key={status} className={`px-2 py-0.5 text-xs rounded-md border ${STATUS_STYLES[status] || STATUS_STYLES.open}`}>
              {statusLabel(status)}: {count as number}
            </span>
          )
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* ── Ticket list ── */}
        <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] flex flex-col overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
          {/* Filters */}
          <div className="p-3 border-b border-white/8 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/8 rounded-lg text-sm text-white placeholder-white/25 focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] outline-none"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-full"
              options={[
                { value: "", label: "All statuses" },
                { value: "open", label: "Open (not closed)" },
                { value: "new", label: "New" },
                { value: "waiting_admin", label: "Waiting Admin" },
                { value: "waiting_user", label: "Waiting User" },
                { value: "resolved", label: "Resolved" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-white/30">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">No tickets found</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filteredTickets.map((item: any) => {
                  const isSelected = selectedTicket?.ticket?.id === item.ticket.id;
                  const needsAttention = item.ticket.status === "new" || item.ticket.status === "waiting_admin";
                  return (
                    <button
                      key={item.ticket.id}
                      onClick={() => setSelectedTicket(item)}
                      className={`w-full text-left px-3 py-3 rounded-lg transition-all border ${
                        isSelected
                          ? "bg-[hsl(210_100%_50%)/12] border-[hsl(210_100%_50%)/25]"
                          : "border-transparent hover:bg-white/4"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className={`text-sm font-medium truncate leading-tight ${isSelected ? "text-white" : "text-white/80"}`}>
                          {item.ticket.title}
                        </p>
                        {needsAttention && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-[hsl(45_100%_51%)] mt-0.5" />
                        )}
                      </div>
                      <p className="text-xs text-white/40 truncate mb-2">
                        {item.user?.email || item.ticket.guestEmail || "Guest"}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${STATUS_STYLES[item.ticket.status] || STATUS_STYLES.open}`}>
                          {statusLabel(item.ticket.status)}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${PRIORITY_STYLES[item.ticket.priority] || PRIORITY_STYLES.normal}`}>
                          {item.ticket.priority}
                        </span>
                        <span className="text-[10px] text-white/25 ml-auto">
                          {timeAgo(item.ticket.lastMessageAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-white/8 text-xs text-white/25 text-center">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* ── Ticket detail ── */}
        <div className="min-w-0">
          {!selectedTicket ? (
            <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] flex flex-col items-center justify-center py-20 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
              <div className="w-14 h-14 rounded-full bg-white/4 flex items-center justify-center mb-3">
                <MessageSquare className="h-6 w-6 text-white/20" />
              </div>
              <p className="text-white/40 text-sm">Select a ticket to view</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] flex flex-col shadow-[0_18px_48px_rgba(0,0,0,0.2)]" style={{ maxHeight: "calc(100vh - 160px)" }}>
              {/* Ticket header */}
              <div className="px-5 py-4 border-b border-white/8 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h2 className="text-base font-semibold text-white truncate">{ticket.title}</h2>
                      <span className="text-xs font-mono text-white/30">#{ticket.ticketNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <User className="h-3 w-3" />
                      <span>{selectedTicket.user?.email || ticket.guestEmail || "Guest"}</span>
                      <span className="text-white/20">·</span>
                      <Clock className="h-3 w-3" />
                      <span>{new Date(ticket.createdAt).toLocaleDateString("en-AU", { dateStyle: "medium" })}</span>
                      {ticket.guestEmail && !ticket.auth0UserId && (
                        <>
                          <span className="text-white/20">·</span>
                          <span className="text-[hsl(14_100%_70%)]">Guest</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {(ticket.status === "closed" || ticket.status === "resolved") && (
                      <button
                        onClick={() => reopenMutation.mutate(ticket.id)}
                        disabled={reopenMutation.isPending}
                        className="p-1.5 text-white/30 hover:text-[hsl(160_84%_60%)] hover:bg-[hsl(160_84%_39%)/10] rounded-lg transition-colors"
                        title="Reopen"
                      >
                        {reopenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </button>
                    )}
                    {ticket.status !== "closed" && (
                      <button
                        onClick={() => closeMutation.mutate(ticket.id)}
                        disabled={closeMutation.isPending}
                        className="p-1.5 text-white/30 hover:text-[hsl(14_100%_70%)] hover:bg-[hsl(14_100%_60%)/10] rounded-lg transition-colors"
                        title="Close"
                      >
                        {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-1.5 text-white/30 hover:text-[hsl(0_84%_70%)] hover:bg-[hsl(0_84%_60%)/10] rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Metadata controls */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Status</p>
                    <Select
                      value={ticket.status}
                      onChange={(val) => handleUpdate("status", val)}
                      options={[
                        { value: "new", label: "New" },
                        { value: "open", label: "Open" },
                        { value: "waiting_user", label: "Waiting User" },
                        { value: "waiting_admin", label: "Waiting Admin" },
                        { value: "resolved", label: "Resolved" },
                        { value: "closed", label: "Closed" },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Priority</p>
                    <Select
                      value={ticket.priority}
                      onChange={(val) => handleUpdate("priority", val)}
                      options={[
                        { value: "low", label: "Low" },
                        { value: "normal", label: "Normal" },
                        { value: "high", label: "High" },
                        { value: "urgent", label: "Urgent" },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Category</p>
                    <Select
                      value={ticket.category}
                      onChange={(val) => handleUpdate("category", val)}
                      options={[
                        { value: "sales", label: "Sales" },
                        { value: "support", label: "Support" },
                        { value: "accounts", label: "Accounts" },
                        { value: "abuse", label: "Abuse" },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-8 text-white/30">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : ticketDetails?.messages?.length === 0 ? (
                  <p className="text-center text-white/30 text-sm py-8">No messages yet</p>
                ) : (
                  ticketDetails?.messages?.map((msg: any) => {
                    const isAdmin = msg.authorType === "admin";
                    const isNote = msg.isInternalNote;
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                          isNote
                            ? "bg-[hsl(45_100%_51%)/8] border border-[hsl(45_100%_51%)/20]"
                            : isAdmin
                            ? "bg-[hsl(210_100%_50%)/12] border border-[hsl(210_100%_50%)/20]"
                            : "bg-white/5 border border-white/8"
                        }`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium text-white/60">
                              {msg.authorName || msg.authorEmail}
                            </span>
                            {isAdmin && !isNote && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-[hsl(210_100%_50%)/15] text-[hsl(210_100%_65%)] rounded">
                                Admin
                              </span>
                            )}
                            {isNote && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-[hsl(45_100%_51%)/15] text-[hsl(45_100%_60%)] rounded flex items-center gap-1">
                                <StickyNote className="h-2.5 w-2.5" />
                                Internal Note
                              </span>
                            )}
                            <span className="text-[10px] text-white/25 ml-auto">
                              {new Date(msg.createdAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </div>
                          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              {ticket.status !== "closed" && (
                <div className="px-4 py-4 border-t border-white/8 shrink-0 space-y-2">
                  {/* Note toggle */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsInternalNote(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        !isInternalNote
                          ? "bg-[hsl(210_100%_50%)/15] text-[hsl(210_100%_65%)] border-[hsl(210_100%_50%)/25]"
                          : "bg-white/4 text-white/40 border-white/8 hover:bg-white/8"
                      }`}
                    >
                      <Send className="h-3 w-3" />
                      Reply to Customer
                    </button>
                    <button
                      onClick={() => setIsInternalNote(true)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        isInternalNote
                          ? "bg-[hsl(45_100%_51%)/15] text-[hsl(45_100%_60%)] border-[hsl(45_100%_51%)/25]"
                          : "bg-white/4 text-white/40 border-white/8 hover:bg-white/8"
                      }`}
                    >
                      <StickyNote className="h-3 w-3" />
                      Internal Note
                    </button>

                    {/* Canned responses */}
                    <div className="relative ml-auto" ref={cannedRef}>
                      <button
                        onClick={() => setShowCanned(!showCanned)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/4 border border-white/8 text-white/40 hover:text-white/70 rounded-lg text-xs transition-colors"
                      >
                        <Tag className="h-3 w-3" />
                        Canned
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {showCanned && (
                        <div className="absolute bottom-full right-0 mb-2 w-56 bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl z-10 overflow-hidden">
                          {CANNED_RESPONSES.map((r) => (
                            <button
                              key={r.label}
                              onClick={() => {
                                setReplyText((prev) => prev + r.text);
                                setShowCanned(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/6 hover:text-white transition-colors"
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Textarea + send */}
                  <div className={`rounded-xl border transition-colors ${
                    isInternalNote ? "border-[hsl(45_100%_51%)/25] bg-[hsl(45_100%_51%)/5]" : "border-white/10 bg-white/3"
                  }`}>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
                      }}
                      placeholder={isInternalNote ? "Add an internal note (not visible to the customer)..." : "Type your reply..."}
                      rows={4}
                      className="w-full px-4 py-3 bg-transparent outline-none resize-none text-white text-sm placeholder-white/25 rounded-t-xl"
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-t border-white/6">
                      <p className="text-xs text-white/25">Ctrl+Enter to send</p>
                      <button
                        onClick={handleSend}
                        disabled={!replyText.trim() || replyMutation.isPending}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isInternalNote
                            ? "bg-[hsl(45_100%_51%)/20] text-[hsl(45_100%_60%)] hover:bg-[hsl(45_100%_51%)/30]"
                            : "bg-[hsl(210_100%_50%)] text-white hover:bg-[hsl(210_100%_45%)]"
                        }`}
                      >
                        {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {isInternalNote ? "Add Note" : "Send Reply"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {ticket.status === "closed" && (
                <div className="px-4 py-4 border-t border-white/8 shrink-0">
                  <div className="flex items-center justify-between p-3 bg-white/3 rounded-lg border border-white/6">
                    <p className="text-sm text-white/40">This ticket is closed.</p>
                    <button
                      onClick={() => reopenMutation.mutate(ticket.id)}
                      disabled={reopenMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/20] rounded-lg hover:bg-[hsl(160_84%_39%)/18] transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reopen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Ticket"
        description="Are you sure you want to permanently delete this ticket and all its messages?"
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => { if (selectedTicket) deleteMutation.mutate(selectedTicket.ticket.id); }}
        isPending={deleteMutation.isPending}
      />

      {/* New Ticket Dialog */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(9,14,24,1)_100%)] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="text-base font-semibold text-white">New Ticket on Behalf of User</h2>
              <button
                onClick={() => setShowNewTicket(false)}
                className="p-1.5 text-white/30 hover:text-white rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* User search */}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">User</label>
                {newTicketSelectedUser ? (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-[hsl(210_100%_50%)/10] border border-[hsl(210_100%_50%)/25] rounded-lg">
                    <div>
                      <p className="text-sm text-white font-medium">{newTicketSelectedUser.name || newTicketSelectedUser.email}</p>
                      <p className="text-xs text-white/40">{newTicketSelectedUser.email}</p>
                    </div>
                    <button
                      onClick={() => { setNewTicketSelectedUser(null); setNewTicketUserSearch(""); }}
                      className="text-white/30 hover:text-white transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={newTicketUserSearch}
                      onChange={(e) => setNewTicketUserSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] outline-none"
                      autoFocus
                    />
                    {newTicketUserSearch.trim().length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl z-10 overflow-hidden max-h-48 overflow-y-auto">
                        {searchingUsers ? (
                          <div className="flex items-center justify-center py-4 text-white/30">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : userSearchResults?.users?.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-white/30">No users found</p>
                        ) : (
                          userSearchResults?.users?.map((u: any) => (
                            <button
                              key={u.auth0UserId}
                              onClick={() => { setNewTicketSelectedUser(u); setNewTicketUserSearch(""); }}
                              className="w-full text-left px-4 py-2.5 hover:bg-white/6 transition-colors"
                            >
                              <p className="text-sm text-white">{u.name || u.email}</p>
                              <p className="text-xs text-white/40">{u.email}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Subject</label>
                <input
                  type="text"
                  placeholder="Ticket subject..."
                  value={newTicketTitle}
                  onChange={(e) => setNewTicketTitle(e.target.value)}
                  maxLength={200}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] outline-none"
                />
              </div>

              {/* Category + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Category</label>
                  <Select
                    value={newTicketCategory}
                    onChange={setNewTicketCategory}
                    options={[
                      { value: "support", label: "Support" },
                      { value: "sales", label: "Sales" },
                      { value: "accounts", label: "Accounts" },
                      { value: "abuse", label: "Abuse" },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Priority</label>
                  <Select
                    value={newTicketPriority}
                    onChange={setNewTicketPriority}
                    options={[
                      { value: "low", label: "Low" },
                      { value: "normal", label: "Normal" },
                      { value: "high", label: "High" },
                      { value: "urgent", label: "Urgent" },
                    ]}
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Initial Message</label>
                <textarea
                  placeholder="Describe the issue or intervention..."
                  value={newTicketMessage}
                  onChange={(e) => setNewTicketMessage(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] outline-none resize-none"
                />
                <p className="text-xs text-white/25 mt-1">This message will be sent to the user via email.</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8">
              <button
                onClick={() => setShowNewTicket(false)}
                className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOnBehalf}
                disabled={!newTicketSelectedUser || !newTicketTitle.trim() || !newTicketMessage.trim() || createOnBehalfMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {createOnBehalfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Create & Email User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
