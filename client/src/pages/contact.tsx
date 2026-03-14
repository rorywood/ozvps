import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  MessageSquare,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldAlert,
  TrendingUp,
  User,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const CATEGORIES = [
  {
    value: "sales",
    label: "Sales",
    description: "Pricing, plans & quotes",
    icon: TrendingUp,
    color: "text-blue-400",
    activeBorder: "border-primary",
    activeBg: "bg-primary/10",
  },
  {
    value: "abuse",
    label: "Abuse Report",
    description: "Spam, attacks & violations",
    icon: ShieldAlert,
    color: "text-red-400",
    activeBorder: "border-destructive",
    activeBg: "bg-destructive/5",
  },
];

const FAQ = [
  {
    q: "Do I need an account to contact you?",
    a: "No. Anyone can submit a sales or abuse enquiry without an account. You'll receive a unique ticket link by email so you can view and reply to responses.",
  },
  {
    q: "What can I contact sales about?",
    a: "Pricing questions, plan comparisons, bulk or reseller enquiries, custom server configurations, or anything else before you sign up.",
  },
  {
    q: "How do I report network abuse?",
    a: "Select 'Abuse Report' and describe the incident — include the source IP address, timestamps, and any logs you have. We investigate all reports and take action within 4 hours.",
  },
  {
    q: "How will I receive a reply?",
    a: "We'll email you at the address you provide. The email contains a secure link to your ticket where you can view the full conversation and reply. You can also reply directly to the email.",
  },
  {
    q: "I'm an existing customer — where should I go?",
    a: "Sign in to your account and use the Support section for technical help, billing queries, or account issues. You'll get faster responses with access to your account details.",
  },
  {
    q: "Can I submit a technical support request here?",
    a: "This form is for sales and abuse only. For technical support, please sign in to your account — our support team can diagnose issues much faster with access to your server details.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{q}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-5 -mt-1">{a}</p>
      )}
    </div>
  );
}

export default function ContactPage() {
  useDocumentTitle("Contact Support — OzVPS");
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", email: "", category: "", title: "", message: "" });
  const [submitted, setSubmitted] = useState<{ ticketId: number; ticketNumber: number; accessToken: string } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit");
      }
      return response.json();
    },
    onSuccess: (data) => setSubmitted(data),
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    if (!form.category) {
      toast({ title: "Please select an enquiry type", variant: "destructive" });
      return;
    }
    submitMutation.mutate(form);
  }

  // ── Success ─────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border bg-card/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="https://ozvps.com.au">
              <img src={logo} alt="OzVPS" className="h-10 w-auto brightness-0 invert" />
            </a>
            <a href="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </a>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary via-blue-400 to-primary/50" />
              <div className="p-10 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20 mb-6">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Ticket Submitted</h1>
                <p className="text-muted-foreground mb-8">
                  We've emailed <span className="text-foreground font-medium">{form.email}</span> with your ticket details and a link to track replies.
                </p>
                <div className="bg-background border border-border rounded-xl p-6 mb-8">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your ticket number</p>
                  <p className="text-5xl font-bold text-foreground font-mono">#{submitted.ticketNumber ?? submitted.ticketId}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <a href={`/support/guest/${submitted.accessToken}`} className="flex-1">
                    <Button className="w-full"><MessageSquare className="mr-2 h-4 w-4" />View Ticket</Button>
                  </a>
                  <a href="https://ozvps.com.au" className="flex-1">
                    <Button variant="outline" className="w-full"><ExternalLink className="mr-2 h-4 w-4" />Back to OzVPS</Button>
                  </a>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Didn't receive an email? Check your spam folder or{" "}
              <button onClick={() => setSubmitted(null)} className="text-primary hover:underline">submit again</button>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Hero Banner */}
      <div
        className="relative w-full border-b border-border overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(222 50% 4%) 0%, hsl(209 80% 8%) 50%, hsl(222 50% 4%) 100%)",
          minHeight: "320px",
        }}
      >
        {/* Blue glow overlay */}
        <div
          className="absolute inset-x-0 top-0 h-64 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(210 100% 50% / 0.18) 0%, transparent 70%)",
          }}
        />
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Top bar: logo + sign in */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6 flex items-center justify-between">
          <a href="https://ozvps.com.au">
            <img src={logo} alt="OzVPS" className="h-10 w-auto brightness-0 invert" />
          </a>
          <a href="/login">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/30 backdrop-blur-sm"
            >
              Sign In
            </Button>
          </a>
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-16 pt-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-6">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Support Portal
          </div>

          <h1
            className="font-display text-5xl md:text-6xl font-bold text-foreground mb-4 leading-tight tracking-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Get in Touch
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
            Have a question before signing up, or need to report abuse? We're here to help.
          </p>

          {/* Stat badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 backdrop-blur-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">&lt; 24h Sales Response</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 backdrop-blur-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-medium text-foreground">&lt; 4h Abuse Response</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-16">

        {/* Main grid: form + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 mb-20 items-start">

          {/* Form card */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary to-blue-400" />
            <div className="p-10 space-y-8">

              {/* Category */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-3 block">
                  What's this about? <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                        className={cn(
                          "flex items-center gap-4 p-5 rounded-xl border-2 text-left transition-all duration-150",
                          selected
                            ? `${cat.activeBg} ${cat.activeBorder}`
                            : "bg-background border-border hover:border-white/20"
                        )}
                      >
                        <div className={cn(
                          "flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
                          selected ? "bg-white/10" : "bg-white/5"
                        )}>
                          <Icon className={cn("h-5 w-5", selected ? cat.color : "text-muted-foreground")} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{cat.label}</p>
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{cat.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-foreground">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      maxLength={100}
                      className="pl-9 h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                      maxLength={254}
                      className="pl-9 h-11"
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium text-foreground">
                  Subject <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Brief description of your enquiry"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  maxLength={200}
                  className="h-11"
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message" className="text-sm font-medium text-foreground">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">{form.message.length}/5000</span>
                </div>
                <Textarea
                  id="message"
                  placeholder="Give us as much detail as you can..."
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  required
                  rows={7}
                  maxLength={5000}
                  className="resize-none"
                />
              </div>

              <Button
                onClick={handleSubmit}
                className="w-full h-12 font-semibold text-base"
                disabled={submitMutation.isPending || !form.category}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <>Submit Ticket<ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Response Times */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
              <div className="p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Response Times</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Sales enquiries</span>
                    </div>
                    <span className="text-xs font-medium text-foreground bg-white/5 border border-border rounded-full px-3 py-1">Within 24h</span>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Abuse reports</span>
                    </div>
                    <span className="text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">Within 4h</span>
                  </div>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">How it works</h3>
              </div>
              <ol className="space-y-4">
                {[
                  "Submit your enquiry below",
                  "Receive a ticket number by email",
                  "Track replies via your secure ticket link",
                  "Reply by email or on the ticket page",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5 border border-primary/20">
                      {i + 1}
                    </span>
                    <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Existing customer CTA */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">Already a customer?</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <a href="/login" className="text-primary hover:underline font-medium">Sign in to your account</a> for billing queries, technical support, and faster responses with full account access.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* FAQ section */}
        <div>
          <div className="flex items-center gap-4 mb-10">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Frequently Asked Questions</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Quick answers to common questions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-2xl px-7 divide-y divide-border">
              {FAQ.slice(0, Math.ceil(FAQ.length / 2)).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
            <div className="bg-card border border-border rounded-2xl px-7 divide-y divide-border">
              {FAQ.slice(Math.ceil(FAQ.length / 2)).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href="https://ozvps.com.au">
            <img src={logo} alt="OzVPS" className="h-7 w-auto brightness-0 invert opacity-50 hover:opacity-80 transition-opacity" />
          </a>
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} OzVPS Pty Ltd ·{" "}
            <a href="https://ozvps.com.au" className="hover:text-foreground transition-colors">ozvps.com.au</a>
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/login" className="hover:text-foreground transition-colors">Sign In</a>
            <a href="/register" className="hover:text-foreground transition-colors">Register</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
