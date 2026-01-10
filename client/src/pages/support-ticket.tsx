import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SupportTicket, TicketMessage, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import {
  MessageSquare,
  ArrowLeft,
  Clock,
  Loader2,
  Send,
  Server,
  Calendar,
  Tag,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Timer,
  XCircle,
  User,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  sales: "Sales",
  accounts: "Accounts",
  support: "Support",
  abuse: "Abuse",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof CircleDot }> = {
  new: { label: "New", color: "text-blue-400 bg-blue-500/10", icon: CircleDot },
  open: { label: "Open", color: "text-cyan-400 bg-cyan-500/10", icon: CircleDot },
  waiting_user: { label: "Awaiting Your Reply", color: "text-amber-400 bg-amber-500/10", icon: Timer },
  waiting_admin: { label: "In Progress", color: "text-purple-400 bg-purple-500/10", icon: Clock },
  resolved: { label: "Resolved", color: "text-green-400 bg-green-500/10", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground bg-muted/50", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const colors: Record<TicketPriority, string> = {
    low: "text-muted-foreground bg-muted/50",
    normal: "text-foreground bg-muted/50",
    high: "text-amber-400 bg-amber-500/10",
    urgent: "text-red-400 bg-red-500/10",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", colors[priority])}>
      <AlertTriangle className="h-3 w-3" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)} hours ago`;
  } else if (diffDays < 7) {
    return `${Math.floor(diffDays)} days ago`;
  } else {
    return formatDate(dateString);
  }
}

function MessageBubble({ message, isUser }: { message: TicketMessage; isUser: boolean }) {
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "bg-primary/20" : "bg-amber-500/20"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-amber-400" />
        )}
      </div>
      <div className={cn("flex-1 max-w-[80%]", isUser ? "text-right" : "text-left")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">
            {message.authorName || message.authorEmail.split("@")[0]}
          </span>
          {!isUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
              STAFF
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formatRelativeDate(message.createdAt)}</span>
        </div>
        <div
          className={cn(
            "rounded-lg p-3 text-sm",
            isUser
              ? "bg-primary/10 text-foreground"
              : "bg-muted/50 text-foreground"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.message}</p>
        </div>
      </div>
    </div>
  );
}

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ticketId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [replyMessage, setReplyMessage] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["support", "ticket", ticketId],
    queryFn: () => api.getSupportTicket(ticketId),
    enabled: ticketId > 0,
    refetchInterval: 10000, // Refresh every 10 seconds for real-time updates
  });

  useDocumentTitle(data?.ticket ? `Ticket #${data.ticket.id}` : "Support Ticket");

  // Scroll to bottom when messages change
  useEffect(() => {
    if (data?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages]);

  const replyMutation = useMutation({
    mutationFn: (message: string) => api.replyToSupportTicket(ticketId, message),
    onSuccess: () => {
      toast({
        title: "Reply Sent",
        description: "Your message has been sent successfully.",
      });
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.closeSupportTicket(ticketId),
    onSuccess: () => {
      toast({
        title: "Ticket Closed",
        description: "The ticket has been closed.",
      });
      setCloseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.reopenSupportTicket(ticketId),
    onSuccess: () => {
      toast({
        title: "Ticket Reopened",
        description: "The ticket has been reopened.",
      });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    replyMutation.mutate(replyMessage);
  };

  if (!ticketId || ticketId <= 0) {
    return (
      <AppShell>
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground">Invalid Ticket ID</h2>
            <Link href="/support">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Support
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground">Ticket Not Found</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The ticket you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/support">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Support
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const { ticket, messages, server } = data;
  const isResolved = ticket.status === "resolved";
  const isClosed = ticket.status === "closed";
  const isInactive = isResolved || isClosed;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link href="/support">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-muted-foreground">Ticket #{ticket.id}</span>
                <StatusBadge status={ticket.status} />
              </div>
              <h1 className="text-xl font-bold text-foreground">{ticket.title}</h1>
            </div>
          </div>
          {!isInactive && (
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(true)}
              className="text-muted-foreground"
            >
              Close Ticket
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Messages */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl bg-card/50 border border-border overflow-hidden">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-medium text-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversation
                </h2>
              </div>

              <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isUser={message.authorType === "user"}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {!isInactive && (
                <div className="p-4 border-t border-border/50">
                  <form onSubmit={handleSubmitReply} className="space-y-3">
                    <Textarea
                      placeholder="Type your reply..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      rows={3}
                      disabled={replyMutation.isPending}
                    />
                    <div className="flex justify-end">
                      <Button type="submit" disabled={!replyMessage.trim() || replyMutation.isPending}>
                        {replyMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Reply
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {isResolved && (
                <div className="p-4 border-t border-border/50 bg-green-500/10">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-green-400">
                      This ticket is resolved.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopenMutation.mutate()}
                      disabled={reopenMutation.isPending}
                      className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                    >
                      {reopenMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Reopening...
                        </>
                      ) : (
                        "Reopen Ticket"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isClosed && (
                <div className="p-4 border-t border-border/50 bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    This ticket is closed. Please create a new ticket if you need further assistance.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Ticket Details */}
          <div className="space-y-4">
            <div className="rounded-xl bg-card/50 border border-border overflow-hidden">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-medium text-foreground">Ticket Details</h2>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium text-foreground">
                      {CATEGORY_LABELS[ticket.category]}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(ticket.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Updated</p>
                    <p className="text-sm font-medium text-foreground">
                      {formatRelativeDate(ticket.lastMessageAt)}
                    </p>
                  </div>
                </div>

                {server && (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Server className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Affected Server</p>
                      <Link href={`/servers/${server.id}`}>
                        <span className="text-sm font-medium text-primary hover:underline">
                          {server.name || server.hostname}
                        </span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {ticket.status === "waiting_user" && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                <div className="flex items-start gap-3">
                  <Timer className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Response Required</p>
                    <p className="text-xs text-amber-400/80 mt-1">
                      Our support team is waiting for your reply to continue helping you.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close Ticket Dialog */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this ticket? You can reopen it later by sending a new
              reply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing...
                </>
              ) : (
                "Close Ticket"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
