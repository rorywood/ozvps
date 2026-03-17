import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Bookmark,
  CheckCircle2,
  Hash,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Timer,
  XCircle,
} from "lucide-react";
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

function ErrorTicketState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <SupportPublicShell
      eyebrow="Secure Ticket"
      title={title}
      description={message}
      meta={[
        { label: "Access", value: "Token protected" },
        { label: "Replies", value: "Email + web" },
        { label: "Support", value: "OzVPS Desk" },
      ]}
    >
      <div className="mx-auto max-w-xl">
        <SupportPanel className="px-8 py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-red-500/20 bg-red-500/10 text-red-300">
            <XCircle className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold text-white">{title}</h2>
          <p className="mt-3 text-base leading-7 text-white/70">{message}</p>
          <div className="mt-8 flex justify-center">
            <a href="/contact">
              <Button className="rounded-full px-6">Open a new enquiry</Button>
            </a>
          </div>
        </SupportPanel>
      </div>
    </SupportPublicShell>
  );
}

function TicketMetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm text-foreground">{value}</div>
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
        headers: {
          "x-guest-ticket-token": guestToken,
        },
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
      toast({
        title: "Unable to send reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const closeTicketMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/support/guest/close", {
        method: "POST",
        cache: "no-store",
        headers: {
          "x-guest-ticket-token": guestToken,
        },
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
      toast({
        title: "Unable to close ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reopenTicketMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/support/guest/reopen", {
        method: "POST",
        cache: "no-store",
        headers: {
          "x-guest-ticket-token": guestToken,
        },
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
      toast({
        title: "Unable to reopen ticket",
        description: error.message,
        variant: "destructive",
      });
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
        title="Loading your ticket"
        description="We’re fetching the latest messages and status now."
        meta={[
          { label: "Access", value: "Token protected" },
          { label: "Replies", value: "Email + web" },
          { label: "Status", value: "Checking" },
        ]}
      >
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SupportPublicShell>
    );
  }

  if (error || !data) {
    return <ErrorTicketState title="Ticket not found" message="This ticket doesn’t exist anymore or the secure access token is invalid." />;
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
      eyebrow="Secure Ticket Access"
      title={ticket.title}
      description="This private page keeps the full conversation in one place. Replies here and replies by email both feed the same ticket thread."
      meta={[
        { label: "Ticket", value: `#${ticket.ticketNumber ?? ticket.id}` },
        { label: "Opened", value: formatSupportRelativeTime(ticket.createdAt) },
        { label: "Messages", value: String(messages.length) },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_320px]">
        <div className="space-y-6">
          {ticket.status === "waiting_user" && (
            <SupportPanel className="border-amber-500/20 bg-amber-500/[0.07] px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <Timer className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">Reply needed</p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/75">
                    OzVPS support is waiting for more detail in this thread.
                  </p>
                </div>
              </div>
            </SupportPanel>
          )}

          {isResolved && (
            <SupportPanel className="border-emerald-500/20 bg-emerald-500/[0.07] px-6 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">This ticket is resolved</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-100/75">
                      If you need more help on the same issue, reopen the thread and reply below.
                    </p>
                  </div>
                </div>

                <Button onClick={() => reopenTicketMutation.mutate()} disabled={reopenTicketMutation.isPending} className="rounded-full">
                  {reopenTicketMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reopening...
                    </>
                  ) : (
                    "Reopen ticket"
                  )}
                </Button>
              </div>
            </SupportPanel>
          )}

          <SupportPanel className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="text-xl font-semibold text-white">Conversation</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Reply here or by email. Both paths update the same thread.
              </p>
            </div>

            <div className="max-h-[640px] space-y-6 overflow-y-auto px-6 py-6">
              {messages.map((message) => (
                <SupportThreadMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {canReply ? (
              <div className="border-t border-white/10 bg-white/[0.03] px-6 py-5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reply.trim()) return;
                    replyMutation.mutate(reply);
                  }}
                  className="space-y-4"
                >
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Add your reply here."
                    rows={5}
                    disabled={replyMutation.isPending}
                    className="min-h-[150px] resize-none border-white/10 bg-black/10"
                  />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      Replying here also keeps the email thread in sync.
                    </p>

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => closeTicketMutation.mutate()}
                        disabled={closeTicketMutation.isPending}
                        className="rounded-full border-white/10 bg-white/5 hover:bg-white/10"
                      >
                        {closeTicketMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Closing...
                          </>
                        ) : (
                          "Close ticket"
                        )}
                      </Button>

                      <Button type="submit" disabled={!reply.trim() || replyMutation.isPending} className="rounded-full px-5">
                        {replyMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send reply
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="border-t border-white/10 bg-white/[0.03] px-6 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  This ticket is closed. Open a new enquiry if you need help with something else.
                </p>
              </div>
            )}
          </SupportPanel>
        </div>

        <div className="space-y-6">
          <SupportPanel className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Ticket details</p>
            <div className="mt-5 space-y-4">
              <TicketMetaRow label="Ticket number" value={<span className="inline-flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" />#{ticket.ticketNumber ?? ticket.id}</span>} />
              <TicketMetaRow label="Status" value={<SupportStatusBadge status={ticket.status} />} />
              <TicketMetaRow label="Queue" value={<SupportCategoryBadge category={ticket.category} />} />
              <TicketMetaRow label="Opened" value={formatSupportDateTime(ticket.createdAt)} />
              <TicketMetaRow label="Last update" value={formatSupportDateTime(ticket.lastMessageAt)} />
            </div>
          </SupportPanel>

          <SupportPanel className="p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-muted-foreground">
                <Bookmark className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Tip</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Bookmark this page if you want a quick way back in. You’ll still receive replies by email as well.
                </p>
              </div>
            </div>
          </SupportPanel>
        </div>
      </div>
    </SupportPublicShell>
  );
}
