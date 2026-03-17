import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { secureFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Mail, ShieldAlert, TrendingUp, User, CheckCircle2 } from "lucide-react";
import { SupportPanel, SupportPublicShell } from "@/components/support/support-ui";

const CATEGORIES = [
  { value: "sales", label: "Sales", description: "Plans, migrations, and quotes.", icon: TrendingUp },
  { value: "abuse", label: "Abuse", description: "Spam, attacks, and violations.", icon: ShieldAlert },
];

const FAQ = [
  { question: "Do I need an account?", answer: "No. Sales and abuse tickets can be submitted without an account." },
  { question: "Can I get technical support here?", answer: "No. Existing customers should sign in and use the main support desk." },
  { question: "How do replies work?", answer: "We’ll email you a secure ticket link so you can continue the same thread." },
];

const fieldClassName = "border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground";

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
    onSuccess: (data) => setSubmitted(data),
    onError: (error: Error) => {
      toast({ title: "Unable to submit", description: error.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) {
      toast({ title: "Choose a queue", description: "Pick Sales or Abuse first.", variant: "destructive" });
      return;
    }
    submitMutation.mutate(form);
  }

  if (submitted) {
    return (
      <SupportPublicShell
        eyebrow="Ticket Submitted"
        title="Your enquiry is in the queue."
        description="We’ve emailed you a secure ticket link so you can keep the same conversation going."
        meta={[
          { label: "Ticket", value: `#${submitted.ticketNumber ?? submitted.ticketId}` },
          { label: "Email", value: form.email },
        ]}
      >
        <div className="mx-auto max-w-xl">
          <SupportPanel className="px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-white">Ticket #{submitted.ticketNumber ?? submitted.ticketId}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Check <span className="text-foreground">{form.email}</span> for the secure reply link.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="https://ozvps.com.au">
                <Button className="rounded-full px-5">Back to OzVPS</Button>
              </a>
              <Button variant="outline" className="rounded-full border-white/10 bg-white/[0.03] hover:bg-white/[0.06]" onClick={() => setSubmitted(null)}>
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
      title="Sales and abuse contact"
      description="This form is for public enquiries only. Existing customers should sign in for account or technical support."
      meta={[
        { label: "Sales", value: "< 24h" },
        { label: "Abuse", value: "< 4h" },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <SupportPanel className="overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">New enquiry</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-5">
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
                      "rounded-xl border p-4 text-left transition",
                      selected ? "border-primary/35 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", selected ? "border-primary/20 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.04] text-muted-foreground")}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>{category.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="contact-name" className="text-sm font-medium text-foreground">Name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="contact-name"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Your name"
                    maxLength={100}
                    className={cn(fieldClassName, "pl-10")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-email" className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                    placeholder="you@example.com"
                    required
                    maxLength={254}
                    className={cn(fieldClassName, "pl-10")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="contact-title" className="text-sm font-medium text-foreground">Subject</label>
              <Input
                id="contact-title"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                placeholder="Short summary"
                required
                maxLength={200}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="contact-message" className="text-sm font-medium text-foreground">Message</label>
                <span className="text-xs text-muted-foreground">{form.message.length}/5000</span>
              </div>
              <Textarea
                id="contact-message"
                value={form.message}
                onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
                placeholder="Tell us what you need."
                required
                rows={7}
                maxLength={5000}
                className="min-h-[180px] resize-none border-white/10 bg-white/[0.04]"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Already a customer? <a href="/login" className="text-primary hover:text-primary/80">Sign in</a>.
              </p>
              <Button type="submit" disabled={submitMutation.isPending || !form.category} className="rounded-full px-5">
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit enquiry"
                )}
              </Button>
            </div>
          </form>
        </SupportPanel>

        <div className="space-y-4">
          <SupportPanel className="p-4">
            <h2 className="text-sm font-semibold text-white">Before you send</h2>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>Sales: plans, upgrades, migrations, quotes.</p>
              <p>Abuse: include IPs, timestamps, and logs.</p>
              <p>Technical support: use the signed-in support desk.</p>
            </div>
          </SupportPanel>

          <SupportPanel className="overflow-hidden">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">FAQ</h2>
            </div>
            <Accordion type="single" collapsible className="px-4">
              {FAQ.map((item) => (
                <AccordionItem key={item.question} value={item.question} className="border-white/10">
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="text-sm font-medium text-foreground">{item.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </SupportPanel>
        </div>
      </div>
    </SupportPublicShell>
  );
}
