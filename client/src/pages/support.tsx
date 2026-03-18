import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SupportTicket, TicketCategory, TicketPriority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Plus, Search, Timer, Loader2, ArrowRight } from "lucide-react";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SupportCategoryBadge,
  SupportPanel,
  SupportPriorityBadge,
  SupportStatusBadge,
  formatSupportRelativeTime,
} from "@/components/support/support-ui";

const CATEGORY_HELP: Record<TicketCategory, string> = {
  support: "Technical issues, server problems, and access issues.",
  accounts: "Billing, wallet, invoice, and account questions.",
  sales: "Plans, migrations, upgrades, and pre-sales.",
  abuse: "Spam, attacks, and policy violations.",
};

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const needsAction = ticket.status === "waiting_user";

  return (
    <Link href={`/support/${ticket.id}`}>
      <div
        className={cn(
          "cursor-pointer rounded-xl border border-border bg-card p-4 transition hover:border-primary/25 hover:bg-muted/20",
          needsAction && "border-amber-500/25 bg-amber-500/[0.08]",
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">#{ticket.id}</span>
              <SupportStatusBadge status={ticket.status} />
              <SupportCategoryBadge category={ticket.category} />
              <SupportPriorityBadge priority={ticket.priority} />
            </div>

            <h3 className="text-base font-semibold leading-6 text-foreground break-words">{ticket.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Updated {formatSupportRelativeTime(ticket.lastMessageAt)}
              {ticket.virtfusionServerId ? " • Linked server" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {needsAction && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/12 px-2.5 py-1 text-amber-200">
                <Timer className="h-3.5 w-3.5" />
                Reply needed
              </span>
            )}
            <span className="text-primary">Open</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function NewTicketComposer({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TicketCategory>("support");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [description, setDescription] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("none");

  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.listServers(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      category: TicketCategory;
      priority: TicketPriority;
      description: string;
      virtfusionServerId?: string;
    }) => api.createSupportTicket(payload),
    onSuccess: (data) => {
      toast({
        title: "Ticket created",
        description: data.serverAttachmentSkipped
          ? `Ticket #${data.ticket.id} is open. We couldn't auto-link the selected server, but your message was submitted.`
          : `Ticket #${data.ticket.id} is now open.`,
      });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
      onClose();
      setLocation(`/support/${data.ticket.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to create ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      title,
      category,
      priority,
      description,
      virtfusionServerId: selectedServer === "none" ? undefined : selectedServer,
    });
  }

  return (
    <SupportPanel className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">New ticket</h2>
          <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_HELP[category]}</p>
        </div>
        <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          Cancel
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(CATEGORY_HELP) as TicketCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  category === key
                    ? "border-primary/35 bg-primary/10"
                    : "border-border bg-card hover:border-primary/20 hover:bg-muted/20",
                )}
              >
                <p className={cn("text-sm font-medium", category === key ? "text-primary" : "text-foreground")}>
                  {SUPPORT_CATEGORY_LABELS[key]}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{CATEGORY_HELP[key]}</p>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-title">Subject</Label>
            <Input
              id="support-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
              minLength={3}
              maxLength={200}
              required
              className="border-border bg-background text-foreground"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                <SelectTrigger className="border-border bg-background text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {(Object.keys(SUPPORT_PRIORITY_LABELS) as TicketPriority[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SUPPORT_PRIORITY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Affected server</Label>
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger className="border-border bg-background text-foreground">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="none">None</SelectItem>
                  {servers?.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="support-description">Details</Label>
              <span className="text-xs text-muted-foreground">{description.length}/10000</span>
            </div>
            <Textarea
              id="support-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, when it started, and what you’ve already tried."
              minLength={10}
              maxLength={10000}
              rows={7}
              required
              className="min-h-[180px] resize-none border-border bg-background text-foreground"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Attach the server when possible. It helps support jump straight to the right context.
          </div>

          <Button type="submit" disabled={createMutation.isPending} className="w-full rounded-full">
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Submit ticket
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </SupportPanel>
  );
}

export default function SupportPage() {
  useDocumentTitle("Support");

  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ["support", "counts"],
    queryFn: () => api.getSupportTicketCounts(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["support", "tickets", filter],
    queryFn: () => api.getSupportTickets({ status: filter }),
  });

  const tickets = data?.tickets ?? [];
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch = !search || ticket.title.toLowerCase().includes(search.toLowerCase()) || String(ticket.id).includes(search);
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    return matchesSearch && matchesCategory && matchesPriority;
  });

  const waitingUserCount = counts?.waitingUser ?? tickets.filter((ticket) => ticket.status === "waiting_user").length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              <MessageSquare className="h-3.5 w-3.5" />
              Client Support
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Support</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Technical issues, billing questions, and account requests in one place.
            </p>
          </div>

          <div className="flex gap-3">
            <StatPill label="Open" value={counts?.open ?? 0} />
            <StatPill label="Reply needed" value={waitingUserCount} />
            <Button onClick={() => setShowComposer((value) => !value)} className="rounded-full self-center">
              <Plus className="mr-2 h-4 w-4" />
              {showComposer ? "Hide" : "New ticket"}
            </Button>
          </div>
        </div>

        {showComposer && <NewTicketComposer onClose={() => setShowComposer(false)} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <SupportPanel className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <FilterPill active={filter === "all"} label="All" onClick={() => setFilter("all")} />
                  <FilterPill active={filter === "open"} label="Open" onClick={() => setFilter("open")} />
                  <FilterPill active={filter === "closed"} label="Closed" onClick={() => setFilter("closed")} />
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tickets"
                    className="border-border bg-background pl-10 text-foreground"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterPill active={categoryFilter === "all"} label="All queues" onClick={() => setCategoryFilter("all")} />
                  {(Object.keys(SUPPORT_CATEGORY_LABELS) as TicketCategory[]).map((key) => (
                    <FilterPill key={key} active={categoryFilter === key} label={SUPPORT_CATEGORY_LABELS[key]} onClick={() => setCategoryFilter(key)} />
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterPill active={priorityFilter === "all"} label="Any priority" onClick={() => setPriorityFilter("all")} />
                  {(Object.keys(SUPPORT_PRIORITY_LABELS) as TicketPriority[]).map((key) => (
                    <FilterPill key={key} active={priorityFilter === key} label={SUPPORT_PRIORITY_LABELS[key]} onClick={() => setPriorityFilter(key)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    {search || categoryFilter !== "all" || priorityFilter !== "all" ? "No matching tickets" : "No tickets yet"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {search || categoryFilter !== "all" || priorityFilter !== "all"
                      ? "Try broadening the filters."
                      : "Open a ticket when you need help."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((ticket) => (
                    <TicketRow key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              )}
            </div>
          </SupportPanel>

          <div className="space-y-4">
            <SupportPanel className="p-4">
              <h2 className="text-sm font-semibold text-foreground">Quick help</h2>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <p>Password reset: use the server settings page.</p>
                <p>Billing issues: use the Accounts queue.</p>
                <p>Server incidents: attach the affected server.</p>
                <p>Abuse reports: include IPs and timestamps.</p>
              </div>
            </SupportPanel>

            <SupportPanel className="p-4">
              <h2 className="text-sm font-semibold text-foreground">Keep it tidy</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                If a ticket says <span className="text-amber-200">Action Needed</span>, reply in the same thread instead of opening another one.
              </p>
            </SupportPanel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
