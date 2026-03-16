import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { secureFetch } from "@/lib/api";

const CATEGORIES = [
  {
    value: "sales",
    label: "Sales",
    description: "Pricing, plans & quotes",
    icon: TrendingUp,
  },
  {
    value: "abuse",
    label: "Abuse Report",
    description: "Spam, attacks & violations",
    icon: ShieldAlert,
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
    <div className="border-b border-gray-200 dark:border-white/[0.07] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm font-medium text-foreground group-hover:text-[#0085ff] transition-colors">{q}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-5 -mt-1">{a}</p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl px-4 py-3 text-sm bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] focus:border-[#0085ff]/50 focus:ring-2 focus:ring-[#0085ff]/20 outline-none transition-all duration-200 text-foreground placeholder:text-muted-foreground";

export default function ContactPage() {
  useDocumentTitle("Contact — OzVPS");
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", email: "", category: "", title: "", message: "" });
  const [submitted, setSubmitted] = useState<{ ticketId: number; ticketNumber: number } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await secureFetch("/api/support/contact", {
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

  function handleSubmit(e: React.FormEvent) {
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
      <div className="min-h-screen bg-[hsl(216,40%,96%)] dark:bg-[hsl(222,50%,4%)] flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(216,40%,96%)]/90 dark:bg-[hsl(222,50%,4%)]/80 border-b border-black/[0.07] dark:border-white/[0.06] h-20 flex items-center">
          <div className="max-w-[1400px] mx-auto w-full px-6 lg:px-8 flex items-center justify-between">
            <a href="https://ozvps.com.au">
              <img src={logo} alt="OzVPS" className="h-9 w-auto brightness-0 invert" />
            </a>
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-full h-9 px-5 text-sm font-medium bg-[#0085ff] text-white hover:bg-[#0070dd] transition-colors shadow-[0_4px_14px_rgba(0,133,255,0.3)]"
            >
              Sign In
            </a>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg">
            <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-[#0085ff] to-blue-400" />
              <div className="p-10 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20 mb-6">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Ticket Submitted</h1>
                <p className="text-muted-foreground mb-8">
                  We've emailed <span className="text-foreground font-medium">{form.email}</span> with your ticket details and a link to track replies.
                </p>
                <div className="bg-[hsl(216,40%,96%)] dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6 mb-8">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your ticket number</p>
                  <p className="text-5xl font-bold text-foreground font-mono">#{submitted.ticketNumber ?? submitted.ticketId}</p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    For security, the secure ticket link is only sent to your email inbox.
                  </p>
                  <a href="https://ozvps.com.au" className="block">
                    <button className="w-full inline-flex items-center justify-center rounded-full h-11 px-7 font-medium border border-gray-200 dark:border-white/[0.1] text-foreground hover:bg-white/5 transition-all duration-200">
                      <ExternalLink className="mr-2 h-4 w-4" />Back to OzVPS
                    </button>
                  </a>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Didn't receive an email? Check your spam folder or{" "}
              <button onClick={() => setSubmitted(null)} className="text-[#0085ff] hover:underline">submit again</button>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[hsl(216,40%,96%)] dark:bg-[hsl(222,50%,4%)] flex flex-col">

      {/* Sticky header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(216,40%,96%)]/90 dark:bg-[hsl(222,50%,4%)]/80 border-b border-black/[0.07] dark:border-white/[0.06] h-20 flex items-center">
        <div className="max-w-[1400px] mx-auto w-full px-6 lg:px-8 flex items-center justify-between">
          <a href="https://ozvps.com.au">
            <img src={logo} alt="OzVPS" className="h-9 w-auto brightness-0 invert" />
          </a>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </a>
            <a
              href="/register"
              className="inline-flex items-center justify-center rounded-full h-9 px-5 text-sm font-medium bg-[#0085ff] text-white hover:bg-[#0070dd] transition-colors shadow-[0_4px_14px_rgba(0,133,255,0.3)]"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0085ff]/10 border border-[#0085ff]/20 text-sm font-medium text-[#0085ff] mb-8">
            <MessageSquare className="h-3.5 w-3.5" />
            Support Portal
          </div>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground mb-4">
            Get in <span className="text-[#0085ff]">Touch</span>
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-xl mx-auto">
            Have a question before signing up, or need to report abuse? We're here to help.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-[#0085ff] animate-pulse" />
              <span className="text-sm font-medium text-foreground">&lt; 24h Sales Response</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-medium text-foreground">&lt; 4h Abuse Response</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main grid */}
      <section className="px-6 lg:px-8 pb-16">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">

            {/* Form card */}
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm hover:shadow-[0_8px_24px_rgba(0,133,255,0.1)] hover:border-[#0085ff]/30 dark:hover:border-[#0085ff]/30 transition-all duration-300 overflow-hidden"
            >
              <div className="h-1 bg-gradient-to-r from-[#0085ff] to-blue-400" />
              <div className="p-8 lg:p-10 space-y-8">

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    What's this about? <span className="text-red-500">*</span>
                  </label>
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
                            "flex items-center gap-4 p-5 rounded-xl border-2 text-left transition-all duration-200",
                            selected
                              ? "bg-[#0085ff]/10 border-[#0085ff]"
                              : "bg-white dark:bg-white/[0.02] border-gray-200 dark:border-white/[0.08] hover:border-[#0085ff]/40 hover:bg-[#0085ff]/5"
                          )}
                        >
                          <div className={cn(
                            "flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
                            selected ? "bg-[#0085ff]/20" : "bg-gray-100 dark:bg-white/[0.06]"
                          )}>
                            <Icon className={cn("h-5 w-5", selected ? "text-[#0085ff]" : "text-muted-foreground")} />
                          </div>
                          <div>
                            <p className={cn("text-sm font-semibold", selected ? "text-[#0085ff]" : "text-foreground")}>{cat.label}</p>
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
                    <label htmlFor="name" className="block text-sm font-medium text-foreground">Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        id="name"
                        type="text"
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        maxLength={100}
                        className={cn(inputClass, "pl-10")}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        required
                        maxLength={254}
                        className={cn(inputClass, "pl-10")}
                      />
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label htmlFor="title" className="block text-sm font-medium text-foreground">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    placeholder="Brief description of your enquiry"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                    maxLength={200}
                    className={inputClass}
                  />
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="message" className="block text-sm font-medium text-foreground">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <span className="text-xs text-muted-foreground">{form.message.length}/5000</span>
                  </div>
                  <textarea
                    id="message"
                    placeholder="Give us as much detail as you can..."
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    required
                    rows={7}
                    maxLength={5000}
                    className={cn(inputClass, "resize-none")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitMutation.isPending || !form.category}
                  className="w-full inline-flex items-center justify-center rounded-full h-11 px-7 font-medium bg-[#0085ff] text-white hover:bg-[#0070dd] shadow-[0_4px_14px_rgba(0,133,255,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                  ) : (
                    <>Submit Ticket <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </button>

              </div>
            </form>

            {/* Sidebar */}
            <div className="space-y-4">

              {/* Response Times */}
              <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm hover:shadow-[0_8px_24px_rgba(0,133,255,0.1)] hover:border-[#0085ff]/30 dark:hover:border-[#0085ff]/30 transition-all duration-300 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-[#0085ff]/50 to-transparent" />
                <div className="p-6">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#0085ff]/10 border border-[#0085ff]/20">
                      <Clock className="h-4 w-4 text-[#0085ff]" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Response Times</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Sales enquiries</span>
                      </div>
                      <span className="text-xs font-medium text-foreground bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] rounded-full px-3 py-1">Within 24h</span>
                    </div>
                    <div className="w-full h-px bg-gray-200 dark:bg-white/[0.06]" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Abuse reports</span>
                      </div>
                      <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-full px-3 py-1">Within 4h</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm hover:shadow-[0_8px_24px_rgba(0,133,255,0.1)] hover:border-[#0085ff]/30 dark:hover:border-[#0085ff]/30 transition-all duration-300 p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#0085ff]/10 border border-[#0085ff]/20">
                    <MessageSquare className="h-4 w-4 text-[#0085ff]" />
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
                      <span className="flex-shrink-0 h-6 w-6 rounded-full bg-[#0085ff]/10 text-[#0085ff] text-[11px] font-bold flex items-center justify-center mt-0.5 border border-[#0085ff]/20">
                        {i + 1}
                      </span>
                      <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Existing customer */}
              <div className="rounded-2xl bg-[#0085ff]/5 border border-[#0085ff]/20 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#0085ff]/10 border border-[#0085ff]/20 mt-0.5">
                    <User className="h-4 w-4 text-[#0085ff]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Already a customer?</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      <a href="/login" className="text-[#0085ff] hover:underline font-medium">Sign in to your account</a> for billing queries, technical support, and faster responses with full account access.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0085ff]/10 border border-[#0085ff]/20 text-sm font-medium text-[#0085ff] mb-6">
              <HelpCircle className="h-3.5 w-3.5" />
              FAQ
            </div>
            <h2 className="font-display text-4xl sm:text-5xl text-foreground">
              Common <span className="text-[#0085ff]">Questions</span>
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">Quick answers to help you get started.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm px-7 divide-y divide-gray-200 dark:divide-white/[0.07]">
              {FAQ.slice(0, Math.ceil(FAQ.length / 2)).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
            <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.1] shadow-sm px-7 divide-y divide-gray-200 dark:divide-white/[0.07]">
              {FAQ.slice(Math.ceil(FAQ.length / 2)).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-16 px-6 lg:px-8 bg-[hsl(222,50%,7%)]">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl text-white mb-1">
              Ready to get <span className="text-[#0085ff]">started?</span>
            </h2>
            <p className="text-sm text-white/60">Australian VPS hosting from $7/mo.</p>
          </div>
          <a
            href="/register"
            className="flex-shrink-0 inline-flex items-center justify-center rounded-full h-11 px-7 font-medium bg-[#0085ff] text-white hover:bg-[#0070dd] shadow-[0_4px_14px_rgba(0,133,255,0.3)] transition-all duration-200"
          >
            Create Account <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.07] dark:border-white/[0.07] py-12 px-6 lg:px-8 backdrop-blur-sm bg-white/50 dark:bg-background/30">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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
