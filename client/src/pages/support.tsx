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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  CircleDashed,
  Clock3,
  CreditCard,
  Filter,
  HelpCircle,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Timer,
} from "lucide-react";
import {
  SupportCategoryBadge,
  SUPPORT_CATEGORY_LABELS,
  SupportPanel,
  SupportPriorityBadge,
  SUPPORT_PRIORITY_LABELS,
  SupportStatusBadge,
  formatSupportRelativeTime,
} from "@/components/support/support-ui";

const QUICK_HELP = [
  {
    title: "Password reset",
    body: "Open the server page, head to settings, and trigger a password reset. The new credentials arrive by email.",
    icon: RefreshCw,
  },
  {
    title: "Billing issues",
    body: "Use Accounts for wallet, invoice, and renewal questions. Include the affected invoice or transaction if you have it.",
    icon: CreditCard,
  },
  {
    title: "Server incidents",
    body: "Use Support and attach the server if possible. Mention what changed, when it started, and what you've already tried.",
    icon: Server,
  },
  {
    title: "Abuse or urgent reports",
    body: "Use Abuse for spam, attacks, or network misuse reports so the right queue sees it first.",
    icon: ShieldAlert,
  },
];

const CATEGORY_HELP: Record<TicketCategory, { label: string; hint: string }> = {
  support: {
    label: "Technical Support",
    hint: "Best for outages, configuration issues, login problems, or anything affecting a running server.",
  },
  accounts: {
    label: "Accounts",
    hint: "Best for billing, invoices, wallet questions, account access, and verification issues.",
  },
  sales: {
    label: "Sales",
    hint: "Best for plan advice, upgrades, migrations, or pre-purchase questions.",
  },
  abuse: {
    label: "Abuse",
    hint: "Best for urgent reports about spam, attacks, or policy violations.",
  },
};

function QueueStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/60">{note}</p>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const needsAction = ticket.status === "waiting_user";

  return (
    <Link href={`/support/${ticket.id}`}>
      <div
        className={cn(
          "group cursor-pointer rounded-[26px] border border-white/8 bg-white/[0.03] p-5 transition hover:border-primary/30 hover:bg-primary/[0.06] hover:shadow-[0_18px_40px_rgba(0,133,255,0.14)]",
          needsAction && "border-amber-500/25 bg-amber-500/[0.06]",
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ticket #{ticket.id}
              </span>
              <SupportStatusBadge status={ticket.status} />
              <SupportCategoryBadge category={ticket.category} />
              <SupportPriorityBadge priority={ticket.priority} />
            </div>

            <h3 className="text-lg font-semibold text-foreground transition group-hover:text-white">
              {ticket.title}
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span>Updated {formatSupportRelativeTime(ticket.lastMessageAt)}</span>
              <span>Opened {formatSupportRelativeTime(ticket.createdAt)}</span>
              {ticket.virtfusionServerId && <span>Linked to a server</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {needsAction && (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
                <Timer className="h-3.5 w-3.5" />
                Reply needed
              </div>
            )}

            <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
              Open thread
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NewTicketComposer({
  onClose,
}: {
  onClose: () => void;
}) {
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
        description: `Ticket #${data.ticket.id} is now in the queue.`,
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
    <SupportPanel className="overflow-hidden">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(0,133,255,0.14),rgba(255,255,255,0.03))] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">New Support Ticket</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Describe the issue once, route it properly, and keep the thread tidy.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Pick the closest queue, attach the affected server if there is one, and include the exact error or symptom you are seeing.
            </p>
          </div>

          <Button variant="outline" onClick={onClose} className="border-white/10 bg-white/5 hover:bg-white/10">
            Close
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div>
            <Label className="mb-3 block text-sm font-medium text-foreground">Queue</Label>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(CATEGORY_HELP) as TicketCategory[]).map((key) => {
                const option = CATEGORY_HELP[key];
                const selected = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition",
                      selected
                        ? "border-primary/40 bg-primary/10 shadow-[0_12px_30px_rgba(0,133,255,0.14)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    )}
                  >
                    <p className={cn("text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>{option.label}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-title">Subject</Label>
            <Input
              id="support-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the issue"
              minLength={3}
              maxLength={200}
              required
              className="h-12 border-white/10 bg-white/[0.03]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                <SelectTrigger className="h-12 border-white/10 bg-white/[0.03]">
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
              <Label>Affected Server</Label>
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger className="h-12 border-white/10 bg-white/[0.03]">
                  <SelectValue placeholder="General enquiry" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="none">None / General enquiry</SelectItem>
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
              placeholder="What happened, when it started, what changed, and what you've already tried."
              minLength={10}
              maxLength={10000}
              rows={9}
              required
              className="min-h-[220px] resize-none border-white/10 bg-white/[0.03]"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">What helps most</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Exact error text or screenshot.</li>
              <li>What changed before the issue started.</li>
              <li>Whether it affects one server or everything.</li>
              <li>Any deadline or customer impact.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Current route</p>
            <p className="mt-3 text-lg font-semibold text-white">{CATEGORY_HELP[category].label}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{CATEGORY_HELP[category].hint}</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={createMutation.isPending} className="h-12 rounded-full text-sm font-semibold">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating ticket...
                </>
              ) : (
                <>
                  Submit ticket
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
          </div>
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
      <div className="space-y-8">
        <SupportPanel className="overflow-hidden border-primary/15 bg-[linear-gradient(135deg,rgba(0,133,255,0.18),rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.03))]">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8 lg:py-10">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <MessageSquare className="h-3.5 w-3.5" />
                Support Desk
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Keep support organised, fast to scan, and easy to reply to.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
                Your technical issues, billing questions, and sales requests all live here. Open a ticket once, keep the conversation in one place, and pick up replies without digging around.
              </p>

              {waitingUserCount > 0 && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300">
                  <Timer className="h-4 w-4" />
                  {waitingUserCount} ticket{waitingUserCount === 1 ? "" : "s"} need your reply
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <QueueStat label="Open" value={String(counts?.open ?? 0)} note="Threads still active" />
              <QueueStat label="Waiting on you" value={String(counts?.waitingUser ?? 0)} note="Support needs a reply" />
              <QueueStat label="All tickets" value={String(counts?.total ?? 0)} note="Complete support history" />
            </div>
          </div>
        </SupportPanel>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="space-y-6">
            {!showComposer && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <CircleDashed className="h-4 w-4" />
                  Filter the queue, search quickly, or open a new ticket.
                </div>
                <Button onClick={() => setShowComposer(true)} className="rounded-full px-5">
                  <Plus className="mr-2 h-4 w-4" />
                  New ticket
                </Button>
              </div>
            )}

            {showComposer && <NewTicketComposer onClose={() => setShowComposer(false)} />}

            <SupportPanel className="overflow-hidden">
              <div className="border-b border-white/10 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Inbox</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Your support threads</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
                    <FilterChip active={filter === "open"} onClick={() => setFilter("open")}>Open</FilterChip>
                    <FilterChip active={filter === "closed"} onClick={() => setFilter("closed")}>Closed</FilterChip>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by subject or ticket number"
                      className="h-12 border-white/10 bg-white/[0.03] pl-11"
                    />
                  </div>

                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>All queues</FilterChip>
                      {(Object.keys(SUPPORT_CATEGORY_LABELS) as TicketCategory[]).map((key) => (
                        <FilterChip key={key} active={categoryFilter === key} onClick={() => setCategoryFilter(key)}>
                          {SUPPORT_CATEGORY_LABELS[key]}
                        </FilterChip>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <FilterChip active={priorityFilter === "all"} onClick={() => setPriorityFilter("all")}>Any priority</FilterChip>
                      {(Object.keys(SUPPORT_PRIORITY_LABELS) as TicketPriority[]).map((key) => (
                        <FilterChip key={key} active={priorityFilter === key} onClick={() => setPriorityFilter(key)}>
                          {SUPPORT_PRIORITY_LABELS[key]}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-muted-foreground">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-white">
                      {search || categoryFilter !== "all" || priorityFilter !== "all" ? "No matching tickets" : "No tickets yet"}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      {search || categoryFilter !== "all" || priorityFilter !== "all"
                        ? "Try a broader search or clear a filter to bring more of the queue back into view."
                        : "Open your first ticket and keep technical, billing, and sales conversations in one place."}
                    </p>
                    {!showComposer && (
                      <Button onClick={() => setShowComposer(true)} className="mt-6 rounded-full px-5">
                        <Plus className="mr-2 h-4 w-4" />
                        Create a ticket
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredTickets.map((ticket) => (
                      <TicketRow key={ticket.id} ticket={ticket} />
                    ))}
                  </div>
                )}
              </div>
            </SupportPanel>
          </div>

          <div className="space-y-6">
            <SupportPanel className="overflow-hidden">
              <div className="border-b border-white/10 px-6 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Quick answers</p>
                <h2 className="mt-2 text-xl font-semibold text-white">The questions that usually don’t need a full thread.</h2>
              </div>
              <Accordion type="single" collapsible className="px-6">
                {QUICK_HELP.map((item) => (
                  <AccordionItem key={item.title} value={item.title} className="border-white/10">
                    <AccordionTrigger className="py-4 text-left hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.title}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">
                      {item.body}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </SupportPanel>

            <SupportPanel className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <HelpCircle className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Keep the thread moving</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    If a ticket is marked <span className="text-amber-300">Action Needed</span>, reply in the same thread instead of opening another one. That keeps the full timeline with the agent already handling it.
                  </p>
                </div>
              </div>
            </SupportPanel>

            <SupportPanel className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-muted-foreground">
                  <Clock3 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Response guidance</p>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>Sales and planning questions: usually same-day.</p>
                    <p>Technical issues: fastest when the affected server is attached.</p>
                    <p>Abuse reports: include source IP, timestamps, and logs if you have them.</p>
                  </div>
                </div>
              </div>
            </SupportPanel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
