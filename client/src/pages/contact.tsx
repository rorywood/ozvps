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
  ArrowLeft,
  Headphones,
  Globe,
  Lock,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const CATEGORIES = [
  {
    value: "sales",
    label: "Sales Enquiry",
    description: "Pricing, plans, or custom quotes",
    icon: TrendingUp,
    accent: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
  },
  {
    value: "abuse",
    label: "Network Abuse",
    description: "Report spam, attacks, or policy violations",
    icon: ShieldAlert,
    accent: "text-red-400",
    border: "border-red-500/40",
    bg: "bg-red-500/10",
  },
];

export default function ContactPage() {
  useDocumentTitle("Contact Us — OzVPS");
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", email: "", category: "", title: "", message: "" });
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
    onSuccess: (data) => setSubmitted(data),
    onError: (error: Error) => {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
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

  // ── Success screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex bg-gradient-to-br from-[#0a0d14] via-[#0d1117] to-[#0a0d14] items-center justify-center p-6">
        {/* Background orbs */}
        <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-[128px] pointer-events-none" />
        <div className="fixed bottom-1/4 right-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[96px] pointer-events-none" />

        <div className="relative w-full max-w-md text-center">
          <div className="bg-[#0d1117]/80 backdrop-blur-xl border border-white/10 border-t-2 border-t-emerald-500 rounded-2xl p-10 shadow-2xl shadow-black/20">
            <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Enquiry Received</h1>
            <p className="text-[#a6a6a6] mb-8 leading-relaxed">
              We've received your message and sent a confirmation to{" "}
              <span className="text-white font-medium">{form.email}</span>.
              Our team will get back to you shortly.
            </p>

            <div className="bg-[#161b22]/60 border border-white/10 rounded-xl p-4 mb-8 text-left">
              <p className="text-xs uppercase tracking-widest text-[#525252] mb-1.5">Ticket Reference</p>
              <p className="text-3xl font-bold text-white font-mono">#{submitted.ticketId}</p>
              <p className="text-xs text-[#737373] mt-1.5">Bookmark your ticket link to check replies</p>
            </div>

            <div className="flex flex-col gap-3">
              <a href={`/support/guest/${submitted.accessToken}`}>
                <Button className="w-full h-11 text-sm font-semibold rounded-xl">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  View Your Ticket
                </Button>
              </a>
              <a href="https://ozvps.com.au">
                <Button variant="outline" className="w-full h-11 text-sm font-semibold rounded-xl border-white/10 text-[#a6a6a6] hover:text-white hover:bg-white/5">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to OzVPS
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#0a0d14] via-[#0d1117] to-[#0a0d14]">

      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-[96px]" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <a href="https://ozvps.com.au">
              <img src={logo} alt="OzVPS" className="h-20 w-auto brightness-0 invert" />
            </a>
          </div>

          <div>
            <div className="mb-14">
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                We're here<br />
                <span className="text-primary">to help.</span>
              </h1>
              <p className="text-xl text-[#a6a6a6] leading-relaxed max-w-md">
                Have a question about our plans or need to report abuse? Our team responds fast.
              </p>
            </div>

            <div className="grid gap-7">
              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Sales & Pricing</h3>
                  <p className="text-sm text-[#737373]">Custom quotes, bulk orders, or general enquiries</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Abuse Reports</h3>
                  <p className="text-sm text-[#737373]">Spam, DDoS, or policy violations</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Private & Secure</h3>
                  <p className="text-sm text-[#737373]">Your ticket link is unique — no account needed</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs text-[#525252]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>All systems operational · Brisbane, AU</span>
            </div>
          </div>

          <div className="text-sm text-[#525252]">
            © {new Date().getFullYear()} OzVPS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-lg py-8">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <a href="https://ozvps.com.au">
              <img src={logo} alt="OzVPS" className="h-16 w-auto mx-auto brightness-0 invert" />
            </a>
            <p className="text-sm text-[#737373] mt-2">Australian cloud servers</p>
          </div>

          {/* Card */}
          <div className="bg-[#0d1117]/80 backdrop-blur-xl border border-white/10 border-t-2 border-t-[hsl(210_100%_50%)] rounded-2xl p-8 shadow-2xl shadow-black/20">
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-white mb-1.5">Contact Us</h2>
              <p className="text-[#a6a6a6] text-sm leading-relaxed">
                For billing or technical support,{" "}
                <a href="/login" className="text-primary hover:text-primary/80 transition-colors">sign in to your account</a>.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Category */}
              <div>
                <Label className="text-sm font-medium text-[#ebebeb] mb-3 block">
                  Enquiry type <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                        className={cn(
                          "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                          selected
                            ? `${cat.bg} ${cat.border}`
                            : "bg-[#161b22]/50 border-white/10 hover:border-white/20"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-lg", selected ? cat.bg : "bg-white/5")}>
                          <Icon className={cn("h-4 w-4", selected ? cat.accent : "text-[#737373]")} />
                        </div>
                        <div>
                          <p className={cn("text-sm font-semibold leading-tight", selected ? "text-white" : "text-[#ebebeb]")}>
                            {cat.label}
                          </p>
                          <p className="text-xs text-[#737373] mt-0.5 leading-tight">{cat.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-[#ebebeb]">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737373] pointer-events-none" />
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      maxLength={100}
                      className="pl-10 h-11 bg-[#161b22]/50 border-white/10 text-white placeholder:text-[#525252] focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-[#ebebeb]">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737373] pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                      maxLength={254}
                      className="pl-10 h-11 bg-[#161b22]/50 border-white/10 text-white placeholder:text-[#525252] focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-sm font-medium text-[#ebebeb]">
                  Subject <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Brief description of your enquiry"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  minLength={5}
                  maxLength={200}
                  className="h-11 bg-[#161b22]/50 border-white/10 text-white placeholder:text-[#525252] focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message" className="text-sm font-medium text-[#ebebeb]">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-[#525252]">{form.message.length}/5000</span>
                </div>
                <Textarea
                  id="message"
                  placeholder="Describe your enquiry in detail..."
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  required
                  rows={5}
                  maxLength={5000}
                  className="resize-none bg-[#161b22]/50 border-white/10 text-white placeholder:text-[#525252] focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold rounded-xl"
                disabled={submitMutation.isPending || !form.category}
              >
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
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <a
              href="https://ozvps.com.au"
              className="text-sm text-[#525252] hover:text-[#a6a6a6] transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to ozvps.com.au
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
