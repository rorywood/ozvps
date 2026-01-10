import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SupportTicket, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import {
  MessageSquare,
  Plus,
  Clock,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Timer,
  Search,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  billing: "Billing",
  server: "Server / VM",
  network: "Network",
  panel: "Panel / Login",
  abuse: "Abuse",
  general: "General",
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
  waiting_user: { label: "Awaiting Reply", color: "text-amber-400 bg-amber-500/10", icon: Timer },
  waiting_admin: { label: "In Progress", color: "text-purple-400 bg-purple-500/10", icon: Clock },
  resolved: { label: "Resolved", color: "text-green-400 bg-green-500/10", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground bg-muted/50", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const colors: Record<TicketPriority, string> = {
    low: "text-muted-foreground",
    normal: "text-foreground",
    high: "text-amber-400",
    urgent: "text-red-400",
  };
  return (
    <span className={cn("text-xs font-medium", colors[priority])}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function formatDate(dateString: string): string {
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
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <Link href={`/support/${ticket.id}`}>
      <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50 last:border-b-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">#{ticket.id}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h3 className="font-medium text-foreground truncate">{ticket.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{CATEGORY_LABELS[ticket.category]}</span>
            <span>Updated {formatDate(ticket.lastMessageAt)}</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </Link>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TicketCategory>("general");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [description, setDescription] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("none");

  const { data: serversData } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.listServers(),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      category: TicketCategory;
      priority: TicketPriority;
      description: string;
      virtfusionServerId?: string;
    }) => api.createSupportTicket(data),
    onSuccess: (data) => {
      toast({
        title: "Ticket Created",
        description: `Ticket #${data.ticket.id} has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
      onOpenChange(false);
      setLocation(`/support/${data.ticket.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      category,
      priority,
      description,
      virtfusionServerId: selectedServer === "none" ? undefined : selectedServer,
    });
  };

  const resetForm = () => {
    setTitle("");
    setCategory("general");
    setPriority("normal");
    setDescription("");
    setSelectedServer("none");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle>Create Support Ticket</DialogTitle>
          <DialogDescription>
            Describe your issue and we'll get back to you as soon as possible.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Subject</Label>
            <Input
              id="title"
              placeholder="Brief description of your issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="server">Affected Server (Optional)</Label>
            <Select value={selectedServer} onValueChange={setSelectedServer}>
              <SelectTrigger>
                <SelectValue placeholder="Select a server if applicable" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="none">None / General</SelectItem>
                {serversData?.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      {server.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Please provide as much detail as possible..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={10}
              maxLength={10000}
              rows={6}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Ticket"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SupportPage() {
  useDocumentTitle("Support");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [search, setSearch] = useState("");
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "tickets", filter],
    queryFn: () => api.getSupportTickets({ status: filter }),
  });

  const filteredTickets = data?.tickets.filter((ticket) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      ticket.title.toLowerCase().includes(searchLower) ||
      ticket.id.toString().includes(searchLower)
    );
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Support</h1>
            <p className="text-muted-foreground mt-1">
              Get help with your account or servers
            </p>
          </div>
          <Button onClick={() => setNewTicketOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </div>

        <div className="rounded-xl bg-card/50 border border-border overflow-hidden">
          <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "open" | "closed")}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !filteredTickets?.length ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">
                {search ? "No tickets found" : "No tickets yet"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {search
                  ? "Try adjusting your search or filter"
                  : "Create your first support ticket to get help from our team."}
              </p>
              {!search && (
                <Button onClick={() => setNewTicketOpen(true)} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Ticket
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredTickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
        </div>
      </div>

      <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />
    </AppShell>
  );
}
