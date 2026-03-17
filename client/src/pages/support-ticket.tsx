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
import { ArrowLeft, Loader2, MessageSquare, Send, Server, Timer, XCircle } from "lucide-react";
import {
  SupportCategoryBadge,
  SupportPanel,
  SupportPriorityBadge,
  SupportStatusBadge,
  SupportThreadMessage,
  formatSupportDateTime,
  formatSupportRelativeTime,
} from "@/components/support/support-ui";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm text-foreground">{value}</div>
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
      toast({ title: "Reply sent" });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to send reply", description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.closeSupportTicket(ticketId),
    onSuccess: () => {
      setCloseDialogOpen(false);
      toast({ title: "Ticket closed" });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to close ticket", description: error.message, variant: "destructive" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.reopenSupportTicket(ticketId),
    onSuccess: () => {
      toast({ title: "Ticket reopened" });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to reopen ticket", description: error.message, variant: "destructive" });
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
        <div className="flex min-h-[45vh] items-center justify-center">
          <SupportPanel className="max-w-lg px-8 py-10 text-center">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold text-white">Invalid ticket</h1>
            <p className="mt-2 text-sm text-muted-foreground">This support link doesn’t contain a valid ticket number.</p>
          </SupportPanel>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[45vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex min-h-[45vh] items-center justify-center">
          <SupportPanel className="max-w-lg px-8 py-10 text-center">
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold text-white">Ticket not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This ticket is unavailable to this account.</p>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/support">
              <Button variant="ghost" className="-ml-3 mb-3 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to support
              </Button>
            </Link>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">#{ticket.id}</span>
              <SupportStatusBadge status={ticket.status} />
              <SupportCategoryBadge category={ticket.category} />
              <SupportPriorityBadge priority={ticket.priority} />
            </div>
            <h1 className="text-2xl font-semibold text-white">{ticket.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Opened {formatSupportRelativeTime(ticket.createdAt)} • Updated {formatSupportRelativeTime(ticket.lastMessageAt)}
            </p>
          </div>

          {!isInactive ? (
            <Button variant="outline" onClick={() => setCloseDialogOpen(true)} className="rounded-full border-white/10 bg-white/[0.03] hover:bg-white/[0.06]">
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
                "Reopen ticket"
              )}
            </Button>
          ) : null}
        </div>

        {ticket.status === "waiting_user" && (
          <SupportPanel className="border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-300">
              <Timer className="h-4 w-4" />
              Support is waiting for your reply.
            </div>
          </SupportPanel>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
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

            {!isInactive ? (
              <div className="border-t border-white/10 bg-white/[0.03] p-4">
                <form onSubmit={handleSubmitReply} className="space-y-3">
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Reply to this ticket"
                    rows={5}
                    disabled={replyMutation.isPending}
                    className="min-h-[140px] resize-none border-white/10 bg-black/10"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Replying here keeps the same thread active.</p>
                    <Button type="submit" disabled={!replyMessage.trim() || replyMutation.isPending} className="rounded-full">
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
              <div className="border-t border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground">
                This ticket is closed.
              </div>
            )}
          </SupportPanel>

          <div className="space-y-4">
            <SupportPanel className="p-4">
              <h2 className="text-sm font-semibold text-white">Details</h2>
              <div className="mt-4 space-y-3">
                <MetaRow label="Created" value={formatSupportDateTime(ticket.createdAt)} />
                <MetaRow label="Last update" value={formatSupportDateTime(ticket.lastMessageAt)} />
                <MetaRow label="Status" value={<SupportStatusBadge status={ticket.status} />} />
                {server && (
                  <MetaRow
                    label="Affected server"
                    value={
                      <Link href={`/servers/${server.id}`}>
                        <span className="inline-flex items-center gap-2 text-primary hover:text-primary/80">
                          <Server className="h-4 w-4" />
                          {server.name || server.hostname}
                        </span>
                      </Link>
                    }
                  />
                )}
              </div>
            </SupportPanel>

            <SupportPanel className="p-4">
              <h2 className="text-sm font-semibold text-white">Tip</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Reply in the same thread instead of opening another ticket for the same issue.
              </p>
            </SupportPanel>
          </div>
        </div>
      </div>

      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              You can reopen it later if the same issue comes back.
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
