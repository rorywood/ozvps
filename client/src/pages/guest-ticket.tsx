import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import {
  MessageSquare,
  Clock,
  Loader2,
  Send,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Timer,
  XCircle,
  User,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface TicketMessage {
  id: number;
  authorType: string;
  authorEmail: string;
  authorName: string | null;
  message: string;
  createdAt: string;
}

function MessageBubble({ message, isUser }: { message: TicketMessage; isUser: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "bg-primary/10" : "bg-green-500/10"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-green-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-foreground">
            {message.authorName || message.authorEmail.split("@")[0]}
          </span>
          {!isUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-500 font-medium uppercase tracking-wide">
              Support
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formatRelativeDate(message.createdAt)}</span>
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground leading-relaxed">
            {message.message}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GuestTicketPage() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyMessage, setReplyMessage] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["guest-ticket", accessToken],
    queryFn: async () => {
      const response = await fetch(`/api/support/guest/${accessToken}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch ticket");
      }
      return response.json();
    },
    enabled: !!accessToken && accessToken.length >= 32,
    refetchInterval: 10000,
  });

  useDocumentTitle(data?.ticket ? `Ticket #${data.ticket.id}` : "Support Ticket");

  useEffect(() => {
    if (data?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages]);

  const replyMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch(`/api/support/guest/${accessToken}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send reply");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reply Sent",
        description: "Your message has been sent successfully.",
      });
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: ["guest-ticket", accessToken] });
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

  if (!accessToken || accessToken.length < 32) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground">Invalid Access Link</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This ticket link is invalid or has expired.
          </p>
          <a href="https://ozvps.com.au" className="inline-block mt-4">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Go to OzVPS
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground">Ticket Not Found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The ticket you're looking for doesn't exist or the access link is invalid.
          </p>
          <a href="https://ozvps.com.au" className="inline-block mt-4">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Go to OzVPS
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const { ticket, messages } = data;
  const isResolved = ticket.status === "resolved";
  const isClosed = ticket.status === "closed";
  const isInactive = isResolved || isClosed;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-foreground">OzVPS Support</h1>
                <p className="text-xs text-muted-foreground">Ticket #{ticket.id}</p>
              </div>
            </div>
            <a href="https://app.ozvps.com.au/login">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Ticket Header */}
          <div className="rounded-lg bg-card border border-border p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[ticket.category as TicketCategory]}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground">{ticket.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Created {formatDate(ticket.createdAt)}
            </p>
          </div>

          {/* Messages */}
          <div className="rounded-lg bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation
              </h3>
            </div>

            <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto">
              {messages.map((message: TicketMessage) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isUser={message.authorType === "user"}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {!isInactive && (
              <div className="p-4 border-t border-border bg-muted/20">
                <form onSubmit={handleSubmitReply} className="space-y-3">
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={4}
                    disabled={replyMutation.isPending}
                    className="resize-none"
                  />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                      You can also reply by email
                    </p>
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
              <div className="p-4 border-t border-border bg-green-500/5">
                <p className="text-sm text-green-500 font-medium text-center">
                  This ticket has been resolved. Reply to reopen it.
                </p>
              </div>
            )}

            {isClosed && (
              <div className="p-4 border-t border-border bg-muted/20">
                <p className="text-sm text-muted-foreground text-center">
                  This ticket is closed. Please email support@ozvps.com.au if you need further assistance.
                </p>
              </div>
            )}
          </div>

          {/* Info Banner */}
          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Bookmark this page to easily access your ticket later.
              You can also reply to the confirmation email to add messages to this ticket.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} OzVPS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
