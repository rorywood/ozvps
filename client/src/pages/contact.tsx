import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { secureFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  ShieldAlert,
  TrendingUp,
  User,
} from "lucide-react";
import { SupportPanel, SupportPublicShell } from "@/components/support/support-ui";

const CATEGORIES = [
  {
    value: "sales",
    label: "Sales",
    description: "Plans, migrations, quotes, and pre-purchase questions.",
    icon: TrendingUp,
    response: "Usually within 24 hours",
  },
  {
    value: "abuse",
    label: "Abuse",
    description: "Spam, attacks, malicious traffic, and policy violations.",
    icon: ShieldAlert,
    response: "Usually within 4 hours",
  },
];

const FAQ = [
  {
    question: "Do I need an account to contact OzVPS?",
    answer: "No. Sales and abuse enquiries can be submitted without an account. We’ll email you a secure ticket link so you can keep the conversation going.",
  },
  {
    question: "Can I use this for technical support?",
    answer: "This public form is only for sales and abuse. Existing customers should sign in and use the support desk so the team can see server context immediately.",
  },
  {
    question: "What should I include in an abuse report?",
    answer: "The source IP, timestamps, affected service, and any logs or screenshots you have. The more precise the report, the faster it can be actioned.",
  },
  {
    question: "How do replies work?",
    answer: "You’ll get an email with a secure ticket link. You can reply through that page and keep the whole conversation in one place.",
  },
];

const fieldClassName = "h-12 border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground";

export default function ContactPage() {
  useDocumentTitle("Contact OzVPS");
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "",
    title: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState<{ ticketId: number; ticketNumber: number } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await secureFetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to submit ticket");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSubmitted(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to submit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) {
      toast({
        title: "Choose a queue",
        description: "Pick Sales or Abuse before submitting.",
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate(form);
  }

  if (submitted) {
    return (
      <SupportPublicShell
        eyebrow="Ticket Submitted"
        title="Your enquiry is in the queue."
        description="We’ve sent the secure reply link to your inbox. That link is the fastest way to track responses and continue the thread."
        meta={[
          { label: "Ticket", value: `#${submitted.ticketNumber ?? submitted.ticketId}` },
          { label: "Destination", value: form.email },
          { label: "Queue", value: form.category === "abuse" ? "Abuse" : "Sales" },
        ]}
      >
        <div className="mx-auto max-w-2xl">
          <SupportPanel className="px-8 py-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <h2 className="mt-6 text-3xl font-semibold text-white">Ticket #{submitted.ticketNumber ?? submitted.ticketId}</h2>
            <p className="mt-3 text-base leading-7 text-white/70">
              Check <span className="font-medium text-white">{form.email}</span> for the secure ticket link. Replies can continue there without creating a new enquiry.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="https://ozvps.com.au">
                <Button className="rounded-full px-6">Back to OzVPS</Button>
              </a>
              <Button variant="outline" className="rounded-full border-white/10 bg-white/5 hover:bg-white/10" onClick={() => setSubmitted(null)}>
                Submit another enquiry
              </Button>
            </div>
          </SupportPanel>
        </div>
      </SupportPublicShell>
    );
  }

  return (
    <SupportPublicShell
      eyebrow="Public Contact"
      title={
        <>
          Sales questions and abuse reports,
          <span className="block text-primary">without the support-area mess.</span>
        </>
      }
      description="This is the public desk for pre-sales questions and abuse reports. Existing customers should sign in to use the full support queue with account and server context."
      meta={[
        { label: "Sales", value: "< 24h target" },
        { label: "Abuse", value: "< 4h target" },
        { label: "Delivery", value: "Reply by secure link" },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <SupportPanel className="overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">New Enquiry</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Open a clean ticket in the right queue.</h2>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 px-6 py-6">
            <div>
              <label className="mb-3 block text-sm font-medium text-foreground">
                Choose a queue <span className="text-red-400">*</span>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const selected = form.category === category.value;
                  return (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, category: category.value }))}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition",
                        selected
                          ? "border-primary/40 bg-primary/10 shadow-[0_14px_36px_rgba(0,133,255,0.14)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", selected ? "border-primary/25 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.04] text-muted-foreground")}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className={cn("text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>{category.label}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{category.description}</p>
                          <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-white/45">{category.response}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="contact-name" className="text-sm font-medium text-foreground">Name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="contact-name"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Your name"
                    maxLength={100}
                    className={cn(fieldClassName, "pl-11")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
                  Email <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                    placeholder="you@example.com"
                    required
                    maxLength={254}
                    className={cn(fieldClassName, "pl-11")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="contact-title" className="text-sm font-medium text-foreground">
                Subject <span className="text-red-400">*</span>
              </label>
              <Input
                id="contact-title"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                placeholder="Short summary of the enquiry"
                required
                maxLength={200}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
                  Message <span className="text-red-400">*</span>
                </label>
                <span className="text-xs text-muted-foreground">{form.message.length}/5000</span>
              </div>
              <Textarea
                id="contact-message"
                value={form.message}
                onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
                placeholder="Tell us what you need, what happened, or what we should investigate."
                required
                rows={9}
                maxLength={5000}
                className="min-h-[220px] resize-none border-white/10 bg-white/[0.04]"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">
                Existing customer? <a href="/login" className="font-medium text-primary hover:text-primary/80">Sign in</a> for technical support with full account context.
              </p>
              <Button type="submit" disabled={submitMutation.isPending || !form.category} className="rounded-full px-6">
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit enquiry
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </SupportPanel>

        <div className="space-y-6">
          <SupportPanel className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">How replies work</p>
            <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
              <p>1. Submit the enquiry in the closest queue.</p>
              <p>2. Receive a secure ticket link by email.</p>
              <p>3. View replies and continue the thread from that link.</p>
            </div>
          </SupportPanel>

          <SupportPanel className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Common questions</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Before you open a ticket.</h2>
            </div>
            <Accordion type="single" collapsible className="px-6">
              {FAQ.map((item) => (
                <AccordionItem key={item.question} value={item.question} className="border-white/10">
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="text-sm font-medium text-foreground">{item.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </SupportPanel>

          <SupportPanel className="p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <MessageSquare className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Best use of this form</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Use Sales for upgrades, migrations, quotes, or plan advice. Use Abuse for network misuse and incident reports. Use the signed-in support desk for everything tied to your account or servers.
                </p>
              </div>
            </div>
          </SupportPanel>
        </div>
      </div>
    </SupportPublicShell>
  );
}
