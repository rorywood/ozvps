import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { MessageSquare, CheckCircle2, Loader2, ExternalLink, Mail, ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  {
    value: "sales",
    label: "Sales Enquiry",
    description: "Pricing, plans, or custom quotes",
    icon: TrendingUp,
    color: "text-blue-400",
    selectedBg: "bg-blue-500/10 border-blue-500/40",
  },
  {
    value: "abuse",
    label: "Network Abuse",
    description: "Report spam, attacks, or policy violations",
    icon: ShieldAlert,
    color: "text-red-400",
    selectedBg: "bg-red-500/10 border-red-500/40",
  },
];

export default function ContactPage() {
  useDocumentTitle("Contact Us — OzVPS");
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "",
    title: "",
    message: "",
  });

  const [submitted, setSubmitted] = useState<{ ticketId: number; accessToken: string } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit enquiry");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSubmitted(data);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category) {
      toast({ title: "Please select an enquiry type", variant: "destructive" });
      return;
    }
    submitMutation.mutate(form);
  };

  if (submitted) {
    const ticketUrl = `/support/guest/${submitted.accessToken}`;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Enquiry Received</h1>
          <p className="text-muted-foreground mb-6">
            We've received your message and sent a confirmation to <strong className="text-foreground">{form.email}</strong>. Our team will get back to you shortly.
          </p>
          <div className="bg-card border border-border rounded-xl p-4 mb-6 text-left">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Ticket Reference</p>
            <p className="text-2xl font-bold text-foreground font-mono">#{submitted.ticketId}</p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={ticketUrl}>
              <Button className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" />
                View Your Ticket
              </Button>
            </a>
            <a href="https://ozvps.com.au">
              <Button variant="outline" className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                Back to OzVPS
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-foreground font-display">OzVPS</h1>
              <p className="text-xs text-muted-foreground">Contact Us</p>
            </div>
          </div>
          <a href="/login">
            <Button variant="outline" size="sm">Sign In</Button>
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground font-display mb-2">Get in Touch</h2>
          <p className="text-muted-foreground">
            Have a sales enquiry or need to report network abuse?{" "}
            <a href="/login" className="text-primary hover:underline">Sign in</a> for billing and technical support.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">What can we help you with? <span className="text-destructive">*</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const selected = form.category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                      selected
                        ? `${cat.selectedBg} border-2`
                        : "bg-card border-border hover:border-white/20"
                    )}
                  >
                    <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", selected ? cat.selectedBg : "bg-muted/50")}>
                      <Icon className={cn("h-4 w-4", selected ? cat.color : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-foreground/80")}>{cat.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                maxLength={254}
              />
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Brief description of your enquiry"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              minLength={5}
              maxLength={200}
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Message <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="Describe your enquiry in detail..."
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              required
              rows={6}
              maxLength={5000}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{form.message.length}/5000</p>
          </div>

          <Button type="submit" className="w-full" disabled={submitMutation.isPending || !form.category}>
            {submitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Enquiry
              </>
            )}
          </Button>
        </form>

        <div className="mt-8 p-4 bg-muted/20 border border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Already a customer?</strong> For billing, technical support, or account help,{" "}
            <a href="/login" className="text-primary hover:underline">sign in to your account</a> and use the support portal for faster assistance.
          </p>
        </div>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} OzVPS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
