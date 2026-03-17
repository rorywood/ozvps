import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquare,
  Send,
  Server,
  Timer,
  XCircle,
} from "lucide-react";
import {
  SupportCategoryBadge,
  SupportPanel,
  SupportPriorityBadge,
  SupportStatusBadge,
  SupportThreadMessage,
  formatSupportDateTime,
  formatSupportRelativeTime,
} from "@/components/support/support-ui";

function DetailRow({
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

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
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
    refetchInterval: 10000,
  });

  useDocumentTitle(data?.ticket ? `Ticket #${data.ticket.id}` : "Support Ticket");

  useEffect(() => {
    if (data?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages?.length]);

  const replyMutation = useMutation({
    mutationFn: (message: string) => api.replyToSupportTicket(ticketId, message),
    onSuccess: () => {
      setReplyMessage("");
      toast({
        title: "Reply sent",
        description: "Your message has been added to the thread.",
      });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to send reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.closeSupportTicket(ticketId),
    onSuccess: () => {
      setCloseDialogOpen(false);
      toast({
        title: "Ticket closed",
        description: "This thread has been marked closed.",
      });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to close ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.reopenSupportTicket(ticketId),
    onSuccess: () => {
      toast({
        title: "Ticket reopened",
        description: "The thread is back in the active queue.",
      });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to reopen ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    replyMutation.mutate(replyMessage);
  }

  if (!ticketId || ticketId <= 0) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <SupportPanel className="max-w-lg px-8 py-12 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-5 text-2xl font-semibold text-white">Invalid ticket</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This support link is missing a valid ticket number.</p>
            <Link href="/support">
              <Button className="mt-6 rounded-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to support
              </Button>
            </Link>
          </SupportPanel>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <SupportPanel className="max-w-lg px-8 py-12 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-5 text-2xl font-semibold text-white">Ticket not found</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The ticket you’re looking for no longer exists or isn’t available to this account.
            </p>
            <Link href="/support">
              <Button className="mt-6 rounded-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to support
              </Button>
            </Link>
          </SupportPanel>
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
        <SupportPanel className="overflow-hidden border-primary/15 bg-[linear-gradient(135deg,rgba(0,133,255,0.16),rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.03))]">
          <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-8 lg:py-8">
            <div>
              <Link href="/support">
                <Button variant="ghost" className="-ml-3 mb-4 text-muted-foreground hover:text-white">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to queue
                </Button>
              </Link>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ticket #{ticket.id}
                </span>
                <SupportStatusBadge status={ticket.status} />
                <SupportCategoryBadge category={ticket.category} />
                <SupportPriorityBadge priority={ticket.priority} />
              </div>

              <h1 className="max-w-3xl text-3xl font-semibold text-white sm:text-4xl">{ticket.title}</h1>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Opened {formatSupportRelativeTime(ticket.createdAt)} and last updated {formatSupportRelativeTime(ticket.lastMessageAt)}.
              </p>
            </div>

            <div className="flex flex-col justify-start gap-3">
              {!isInactive ? (
                <Button variant="outline" onClick={() => setCloseDialogOpen(true)} className="border-white/10 bg-white/5 hover:bg-white/10">
                  Close ticket
                </Button>
              ) : isResolved ? (
                <Button onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending} className="rounded-full">
                  {reopenMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reopening...
                    </>
                  ) : (
                    <>
                      Reopen ticket
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Link href="/support">
                  <Button className="rounded-full">
                    Open another ticket
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </SupportPanel>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_340px]">
          <div className="space-y-6">
            {ticket.status === "waiting_user" && (
              <SupportPanel className="border-amber-500/20 bg-amber-500/[0.07] px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                    <Timer className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-300">Support needs your reply</p>
                    <p className="mt-1 text-sm leading-6 text-amber-100/75">
                      Reply in this thread so the existing context stays intact and the queue doesn’t split.
                    </p>
                  </div>
                </div>
              </SupportPanel>
            )}

            {isResolved && (
              <SupportPanel className="border-emerald-500/20 bg-emerald-500/[0.07] px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">This ticket is resolved</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-100/75">
                      If the issue comes back, reopen the thread and reply with what changed.
                    </p>
                  </div>
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
                  Keep replies in this thread so the agent sees the full timeline.
                </p>
              </div>

              <div className="max-h-[680px] space-y-6 overflow-y-auto px-6 py-6">
                {messages.map((message) => (
                  <SupportThreadMessage key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {!isInactive ? (
                <div className="border-t border-white/10 bg-white/[0.03] px-6 py-5">
                  <form onSubmit={handleSubmitReply} className="space-y-4">
                    <Textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Add the next step, result, or exact error message here."
                      rows={5}
                      disabled={replyMutation.isPending}
                      className="min-h-[150px] resize-none border-white/10 bg-black/10"
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Replies here keep the ticket active and notify support automatically.
                      </p>
                      <Button type="submit" disabled={!replyMessage.trim() || replyMutation.isPending} className="rounded-full px-5">
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
                  </form>
                </div>
              ) : (
                <div className="border-t border-white/10 bg-white/[0.03] px-6 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    This thread is closed. Open a new one if you need help with a different issue.
                  </p>
                </div>
              )}
            </SupportPanel>
          </div>

          <div className="space-y-6">
            <SupportPanel className="p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Overview</p>
              <div className="mt-5 space-y-4">
                <DetailRow label="Created" value={formatSupportDateTime(ticket.createdAt)} />
                <DetailRow label="Last update" value={formatSupportDateTime(ticket.lastMessageAt)} />
                <DetailRow label="Status" value={<SupportStatusBadge status={ticket.status} />} />
                <DetailRow label="Queue" value={<SupportCategoryBadge category={ticket.category} />} />
                <DetailRow label="Priority" value={<SupportPriorityBadge priority={ticket.priority} />} />
                {server && (
                  <DetailRow
                    label="Affected server"
                    value={
                      <Link href={`/servers/${server.id}`}>
                        <span className="inline-flex items-center gap-2 text-primary transition hover:text-primary/80">
                          <Server className="h-4 w-4" />
                          {server.name || server.hostname}
                        </span>
                      </Link>
                    }
                  />
                )}
              </div>
            </SupportPanel>

            <SupportPanel className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-muted-foreground">
                  <Clock3 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Keep replies effective</p>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                    <p>Say what changed since the last reply.</p>
                    <p>Include the exact error or screenshot if the behavior is still broken.</p>
                    <p>If the issue is fixed, closing the ticket helps keep the queue tidy.</p>
                  </div>
                </div>
              </div>
            </SupportPanel>
          </div>
        </div>
      </div>

      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing it removes it from the active queue. You can reopen it later if the same issue comes back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing...
                </>
              ) : (
                "Close ticket"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
