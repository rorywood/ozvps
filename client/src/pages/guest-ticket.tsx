import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bookmark, Hash, Loader2, Mail, MessageSquare, Send, Timer, XCircle } from "lucide-react";
import {
  SupportCategoryBadge,
  SupportPanel,
  SupportPublicShell,
  SupportStatusBadge,
  SupportThreadMessage,
  formatSupportDateTime,
  formatSupportRelativeTime,
} from "@/components/support/support-ui";
import { TicketCategory, TicketStatus } from "@/lib/types";

const GUEST_TICKET_TOKEN_STORAGE_KEY = "ozvps:guest-ticket-token";

interface GuestTicketMessage {
  id: number;
  authorType: string;
  authorEmail: string;
  authorName: string | null;
  message: string;
  createdAt: string;
}

function ErrorTicketState({ title, message }: { title: string; message: string }) {
  return (
    <SupportPublicShell
      eyebrow="Secure Ticket"
      title={title}
      description={message}
      meta={[{ label: "Access", value: "Token protected" }]}
    >
      <div className="mx-auto max-w-xl">
        <SupportPanel className="px-6 py-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <div className="mt-6">
            <a href="/contact">
              <Button className="rounded-full px-5">Open a new enquiry</Button>
            </a>
          </div>
        </SupportPanel>
      </div>
    </SupportPublicShell>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function GuestTicketPage() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [reply, setReply] = useState("");
  const storedToken = typeof window !== "undefined" ? window.sessionStorage.getItem(GUEST_TICKET_TOKEN_STORAGE_KEY) : null;
  const hashToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")
    : null;
  const guestToken = hashToken || accessToken || storedToken || "";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tokenFromUrl = hashToken || accessToken || "";
    if (!tokenFromUrl || tokenFromUrl.length < 32) return;

    window.sessionStorage.setItem(GUEST_TICKET_TOKEN_STORAGE_KEY, tokenFromUrl);

    if (hashToken || accessToken) {
      window.history.replaceState(window.history.state, "", "/support/guest");
    }
  }, [accessToken, hashToken]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["guest-ticket", guestToken],
    queryFn: async () => {
      const response = await fetch("/api/support/guest", {
        cache: "no-store",
        headers: { "x-guest-ticket-token": guestToken },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to fetch ticket");
      }
      return response.json();
    },
    enabled: !!guestToken && guestToken.length >= 32,
    refetchInterval: 15000,
  });

  useDocumentTitle(data?.ticket ? `Ticket #${data.ticket.ticketNumber ?? data.ticket.id}` : "Guest Ticket");

  useEffect(() => {
    if (data?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages?.length]);

  const replyMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch("/api/support/guest/messages", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-guest-ticket-token": guestToken,
        },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to send reply");
      }
      return response.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["guest-ticket", guestToken] });
      toast({ title: "Reply sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to send reply", description: error.message, variant: "destructive" });
    },
  });

  const closeTicketMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/support/guest/close", {
        method: "POST",
        cache: "no-store",
        headers: { "x-guest-ticket-token": guestToken },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to close ticket");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-ticket", guestToken] });
      toast({ title: "Ticket closed" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to close ticket", description: error.message, variant: "destructive" });
    },
  });

  const reopenTicketMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/support/guest/reopen", {
        method: "POST",
        cache: "no-store",
        headers: { "x-guest-ticket-token": guestToken },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to reopen ticket");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-ticket", guestToken] });
      toast({ title: "Ticket reopened" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to reopen ticket", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!error || typeof window === "undefined") return;

    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not found") || message.includes("invalid")) {
      window.sessionStorage.removeItem(GUEST_TICKET_TOKEN_STORAGE_KEY);
    }
  }, [error]);

  if (!guestToken || guestToken.length < 32) {
    return <ErrorTicketState title="Invalid link" message="This ticket link is missing or no longer valid." />;
  }

  if (isLoading) {
    return (
      <SupportPublicShell
        eyebrow="Secure Ticket"
        title="Loading ticket"
        description="Fetching the latest messages."
        meta={[{ label: "Access", value: "Token protected" }]}
      >
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SupportPublicShell>
    );
  }

  if (error || !data) {
    return <ErrorTicketState title="Ticket not found" message="This secure link is invalid or the ticket no longer exists." />;
  }

  const { ticket, messages } = data as {
    ticket: {
      id: number;
      ticketNumber?: number;
      title: string;
      category: TicketCategory;
      status: TicketStatus;
      createdAt: string;
      lastMessageAt: string;
    };
    messages: GuestTicketMessage[];
  };

  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";
  const canReply = !isClosed;

  return (
    <SupportPublicShell
      eyebrow="Secure Ticket"
      title={ticket.title}
      description="Reply here or by email. Both update the same thread."
      meta={[
        { label: "Ticket", value: `#${ticket.ticketNumber ?? ticket.id}` },
        { label: "Opened", value: formatSupportRelativeTime(ticket.createdAt) },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          {ticket.status === "waiting_user" && (
            <SupportPanel className="border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-300">
                <Timer className="h-4 w-4" />
                OzVPS support is waiting for your reply.
              </div>
            </SupportPanel>
          )}

          {isResolved && (
            <SupportPanel className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-emerald-300">This ticket is resolved.</p>
                <Button onClick={() => reopenTicketMutation.mutate()} disabled={reopenTicketMutation.isPending} className="rounded-full">
                  {reopenTicketMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reopening...
                    </>
                  ) : (
                    "Reopen"
                  )}
                </Button>
              </div>
            </SupportPanel>
          )}

          <SupportPanel className="overflow-hidden">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-white">Conversation</h2>
              </div>
            </div>

            <div className="max-h-[620px] space-y-5 overflow-y-auto p-4">
              {messages.map((message) => (
                <SupportThreadMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {canReply ? (
              <div className="border-t border-white/10 bg-white/[0.03] p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reply.trim()) return;
                    replyMutation.mutate(reply);
                  }}
                  className="space-y-3"
                >
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply to this ticket"
                    rows={5}
                    maxLength={5000}
                    disabled={replyMutation.isPending}
                    className="min-h-[140px] resize-none border-white/10 bg-black/10"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      Email replies stay in sync too.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => closeTicketMutation.mutate()}
                        disabled={closeTicketMutation.isPending}
                        className="rounded-full border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      >
                        {closeTicketMutation.isPending ? "Closing..." : "Close"}
                      </Button>
                      <Button type="submit" disabled={!reply.trim() || replyMutation.isPending} className="rounded-full">
                        {replyMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="border-t border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground">
                This ticket is closed.
              </div>
            )}
          </SupportPanel>
        </div>

        <div className="space-y-4">
          <SupportPanel className="p-4">
            <h2 className="text-sm font-semibold text-white">Details</h2>
            <div className="mt-4 space-y-3">
              <MetaRow label="Ticket number" value={<span className="inline-flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" />#{ticket.ticketNumber ?? ticket.id}</span>} />
              <MetaRow label="Status" value={<SupportStatusBadge status={ticket.status} />} />
              <MetaRow label="Queue" value={<SupportCategoryBadge category={ticket.category} />} />
              <MetaRow label="Opened" value={formatSupportDateTime(ticket.createdAt)} />
              <MetaRow label="Last update" value={formatSupportDateTime(ticket.lastMessageAt)} />
            </div>
          </SupportPanel>

          <SupportPanel className="p-4">
            <div className="flex items-start gap-3">
              <Bookmark className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Bookmark this page if you want a quick way back to the thread.</p>
            </div>
          </SupportPanel>
        </div>
      </div>
    </SupportPublicShell>
  );
}
