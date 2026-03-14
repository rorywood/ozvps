import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { TicketCategory, TicketStatus } from "@/lib/types";
import {
  MessageSquare,
  Clock,
  Loader2,
  Send,
  CheckCircle2,
  CircleDot,
  Timer,
  XCircle,
  User,
  ShieldCheck,
  ExternalLink,
  Hash,
  Mail,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  sales: "Sales",
  accounts: "Accounts",
  support: "Support",
  abuse: "Abuse Report",
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; dot: string; badge: string }> = {
  new:           { label: "New",                dot: "bg-blue-400",   badge: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  open:          { label: "Open",               dot: "bg-cyan-400",   badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  waiting_user:  { label: "Awaiting Your Reply",dot: "bg-amber-400",  badge: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  waiting_admin: { label: "In Progress",        dot: "bg-purple-400", badge: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  resolved:      { label: "Resolved",           dot: "bg-green-400",  badge: "text-green-400 bg-green-500/10 border-green-500/20" },
  closed:        { label: "Closed",             dot: "bg-neutral-500",badge: "text-muted-foreground bg-muted/40 border-border" },
};

function formatRelative(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function formatFull(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface TicketMessage {
  id: number;
  authorType: string;
  authorEmail: string;
  authorName: string | null;
  message: string;
  createdAt: string;
}

function Message({ msg }: { msg: TicketMessage }) {
  const isSupport = msg.authorType === "admin";
  const displayName = msg.authorName || msg.authorEmail.split("@")[0];

  return (
    <div className={cn("flex gap-3", isSupport ? "flex-row" : "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
        isSupport ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {isSupport ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[75%] min-w-0", isSupport ? "items-start" : "items-end flex flex-col")}>
        <div className="flex items-center gap-2 mb-1.5">
          {isSupport ? (
            <>
              <span className="text-xs font-semibold text-foreground">OzVPS Support</span>
              <span className="text-[10px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 uppercase tracking-wide">Team</span>
            </>
          ) : (
            <span className="text-xs font-semibold text-foreground">{displayName}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{formatRelative(msg.createdAt)}</span>
        </div>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isSupport
            ? "bg-primary/5 border border-primary/10 text-foreground rounded-tl-sm"
            : "bg-card border border-border text-foreground rounded-tr-sm"
        )}>
          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">{formatFull(msg.createdAt)}</p>
      </div>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="https://ozvps.com.au">
            <img src={logo} alt="OzVPS" className="h-10 w-auto brightness-0 invert" />
          </a>
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="h-14 w-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-5">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{message}</p>
          <a href="https://ozvps.com.au">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Go to OzVPS
            </Button>
          </a>
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
  const [reply, setReply] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["guest-ticket", accessToken],
    queryFn: async () => {
      const res = await fetch(`/api/support/guest/${accessToken}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch ticket");
      }
      return res.json();
    },
    enabled: !!accessToken && accessToken.length >= 32,
    refetchInterval: 15000,
  });

  useDocumentTitle(data?.ticket ? `Ticket #${data.ticket.ticketNumber ?? data.ticket.id} — OzVPS Support` : "Support Ticket");

  useEffect(() => {
    if (data?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages?.length]);

  const replyMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/support/guest/${accessToken}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["guest-ticket", accessToken] });
      toast({ title: "Reply sent" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!accessToken || accessToken.length < 32) {
    return <ErrorState title="Invalid Link" message="This ticket link is invalid or has expired." />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState title="Ticket Not Found" message="This ticket doesn't exist or your access link is invalid." />;
  }

  const { ticket, messages } = data;
  const statusCfg = STATUS_CONFIG[ticket.status as TicketStatus] ?? STATUS_CONFIG.open;
  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";
  const canReply = !isClosed;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Nav */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="https://ozvps.com.au">
            <img src={logo} alt="OzVPS" className="h-10 w-auto brightness-0 invert" />
          </a>
          <a href="/login">
            <Button variant="outline" size="sm">Sign In</Button>
          </a>
        </div>
      </nav>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

        {/* Ticket header */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-blue-400 to-transparent" />
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                statusCfg.badge
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                {statusCfg.label}
              </span>
              <span className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-2.5 py-1">
                {CATEGORY_LABELS[ticket.category as TicketCategory] || ticket.category}
              </span>
            </div>

            <h1 className="text-xl font-bold text-foreground mb-4">{ticket.title}</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-0.5">Ticket</p>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />{ticket.ticketNumber ?? ticket.id}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-0.5">Opened</p>
                <p className="text-sm font-semibold text-foreground">{formatRelative(ticket.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-0.5">Messages</p>
                <p className="text-sm font-semibold text-foreground">{messages.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Resolved / closed banner */}
        {isResolved && (
          <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-5 py-3.5">
            <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400 font-medium">This ticket has been resolved. Reply below to reopen it.</p>
          </div>
        )}

        {/* Conversation */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
          </div>

          {/* Messages */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto" style={{ maxHeight: "520px" }}>
            {messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No messages yet.</p>
            ) : (
              messages.map((msg: TicketMessage) => (
                <Message key={msg.id} msg={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          {canReply ? (
            <div className="border-t border-border p-5 bg-background/50">
              <form
                onSubmit={(e) => { e.preventDefault(); if (reply.trim()) replyMutation.mutate(reply); }}
                className="space-y-3"
              >
                <Textarea
                  placeholder="Write your reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  disabled={replyMutation.isPending}
                  className="resize-none"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    You can also reply by email
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!reply.trim() || replyMutation.isPending}
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-3.5 w-3.5" />
                    )}
                    {replyMutation.isPending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="border-t border-border p-5 bg-background/50 text-center">
              <p className="text-sm text-muted-foreground">
                This ticket is closed. Email{" "}
                <a href="mailto:support@ozvps.com.au" className="text-primary hover:underline">support@ozvps.com.au</a>
                {" "}if you need further help.
              </p>
            </div>
          )}
        </div>

        {/* Tip */}
        <div className="flex items-start gap-3 bg-muted/20 border border-border rounded-xl px-5 py-4">
          <Bookmark className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Bookmark this page to check for replies anytime. You'll also get an email when we respond.
          </p>
        </div>
      </div>

      <footer className="border-t border-border py-6">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} OzVPS Pty Ltd · <a href="https://ozvps.com.au" className="hover:text-foreground transition-colors">ozvps.com.au</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
