import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Shield,
  Zap,
  Globe,
  HardDrive,
  Lock,
  Activity,
  Check,
  Server,
  Cpu,
  ArrowRight,
  Loader2,
  Star,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { api } from "@/lib/api";
import { useState, useEffect } from "react";

interface Plan {
  id: number;
  code: string;
  name: string;
  vcpu: number;
  ramMb: number;
  storageGb: number;
  transferGb: number;
  priceMonthly: number;
}

function formatCurrency(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

function formatRAM(mb: number): string {
  if (mb >= 1024) {
    return `${Math.round(mb / 1024)}GB`;
  }
  return `${mb}MB`;
}

// Header Component
function Header({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <img
              src={logo}
              alt="OzVPS"
              className="h-14 w-auto dark:invert-0 invert cursor-pointer"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
            <a
              href="mailto:support@ozvps.com.au"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href={isLoggedIn ? "/dashboard" : "/login"}>
              <Button variant="default" size="sm">
                {isLoggedIn ? "Dashboard" : "Login"}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

// Hero Section
function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Australian badge */}
        <Badge
          variant="outline"
          className="mb-6 px-4 py-1.5 text-sm border-primary/30 bg-primary/5"
        >
          <span className="mr-2">🇦🇺</span>
          Australian-owned & operated
        </Badge>

        {/* Main heading */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
          Australian VPS
          <br />
          <span className="text-primary">from $7/month</span>
        </h1>

        {/* Subheading */}
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          High-performance KVM servers in Sydney & Brisbane.
          <br className="hidden sm:block" />
          DDoS protection. 500 Mbps. Deploy in 60 seconds.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href={isLoggedIn ? "/deploy" : "/register"}>
            <Button size="lg" className="px-8 h-12 text-base gap-2">
              Deploy Now
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#pricing">
            <Button
              variant="outline"
              size="lg"
              className="px-8 h-12 text-base border-white/20 bg-white/5 hover:bg-white/10"
            >
              View Plans
            </Button>
          </a>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            DDoS Protection
          </span>
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            IPv4 + IPv6
          </span>
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            Root Access
          </span>
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            99.9% Uptime
          </span>
        </div>
      </div>
    </section>
  );
}

// Stats Bar
function StatsBar() {
  const stats = [
    { value: "99.9%", label: "Uptime SLA" },
    { value: "<60s", label: "Deploy Time" },
    { value: "500+", label: "Active VPS" },
    { value: "<2hr", label: "Support Response" },
  ];

  return (
    <section className="py-12 border-y border-white/10 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-primary mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Pricing Section
function PricingSection({
  plans,
  isLoading,
  isLoggedIn,
}: {
  plans: Plan[];
  isLoading: boolean;
  isLoggedIn: boolean;
}) {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly"
  );

  // Find the popular plan (Core - middle tier)
  const popularPlanCode = "core";

  return (
    <section id="pricing" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground">
            All prices in AUD including GST
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                billingPeriod === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                billingPeriod === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <Badge variant="success" className="ml-2 text-xs">
                Save 20%
              </Badge>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {plans.map((plan) => {
              const isPopular =
                plan.code.toLowerCase() === popularPlanCode;
              const monthlyPrice = plan.priceMonthly;
              const displayPrice =
                billingPeriod === "yearly"
                  ? Math.round(monthlyPrice * 0.8)
                  : monthlyPrice;

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] ${
                    isPopular
                      ? "bg-white/10 dark:bg-white/5 backdrop-blur-xl border-2 border-primary/50 shadow-lg shadow-primary/20"
                      : "bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground px-3 py-1">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Popular
                      </Badge>
                    </div>
                  )}

                  <div className="text-center mb-6 pt-2">
                    <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-primary">
                        {formatCurrency(displayPrice)}
                      </span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center gap-3">
                      <Cpu className="h-4 w-4 text-primary/70" />
                      <span>
                        {plan.vcpu} vCPU{plan.vcpu > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Server className="h-4 w-4 text-primary/70" />
                      <span>{formatRAM(plan.ramMb)} RAM</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <HardDrive className="h-4 w-4 text-primary/70" />
                      <span>{plan.storageGb}GB SSD</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-primary/70" />
                      <span>{Math.round(plan.transferGb / 1000)}TB Transfer</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6 text-xs text-muted-foreground border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-primary" />
                      500 Mbps Bandwidth
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-primary" />
                      DDoS Protection
                    </div>
                  </div>

                  <Link href={isLoggedIn ? `/deploy/${plan.id}` : "/register"}>
                    <Button
                      className={`w-full ${
                        isPopular
                          ? ""
                          : "bg-white/10 hover:bg-white/20 border border-white/20"
                      }`}
                      variant={isPopular ? "default" : "ghost"}
                    >
                      Deploy
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// Features Grid
function FeaturesSection() {
  const features = [
    {
      icon: Shield,
      title: "DDoS Shield",
      description: "L4 & L7 attack protection included with every VPS",
    },
    {
      icon: Zap,
      title: "Instant Deploy",
      description: "Your server live in under 60 seconds",
    },
    {
      icon: Globe,
      title: "AU Datacenters",
      description: "Sydney + Brisbane for low latency",
    },
    {
      icon: HardDrive,
      title: "SSD Storage",
      description: "Enterprise SSDs for fast I/O",
    },
    {
      icon: Lock,
      title: "Full Root Access",
      description: "Complete control over your VPS",
    },
    {
      icon: Activity,
      title: "99.9% Uptime",
      description: "SLA guaranteed reliability",
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-24 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Why choose OzVPS?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Enterprise-grade infrastructure with Australian support
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Datacenter Locations
function DatacenterSection() {
  const datacenters = [
    {
      city: "Sydney",
      facility: "Equinix SY4",
      tier: "Tier III+",
      latency: "<5ms to major AU cities",
    },
    {
      city: "Brisbane",
      facility: "NEXTDC B2",
      tier: "Tier III",
      latency: "<10ms to East Coast",
    },
  ];

  return (
    <section className="py-20 sm:py-24 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Australian Datacenters
          </h2>
          <p className="text-muted-foreground">
            Premium facilities for maximum reliability and low latency
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {datacenters.map((dc, index) => (
            <div
              key={index}
              className="p-6 rounded-2xl bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">🇦🇺</div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">{dc.city}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {dc.facility} • {dc.tier}
                  </p>
                  <p className="text-sm text-primary">{dc.latency}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// FAQ Section
function FAQSection() {
  const faqs = [
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit cards (Visa, Mastercard, American Express) through our secure Stripe integration. All payments are processed in AUD.",
    },
    {
      question: "How does the prepaid wallet system work?",
      answer:
        "You add funds to your wallet, and server costs are automatically deducted daily. This gives you full control over your spending with no surprise bills. You'll receive notifications when your balance is running low.",
    },
    {
      question: "Can I upgrade or downgrade my VPS?",
      answer:
        "Yes! You can easily upgrade or downgrade your server at any time through the control panel. Changes are applied immediately with a simple server restart.",
    },
    {
      question: "What operating systems are available?",
      answer:
        "We offer a wide range of Linux distributions including Ubuntu, Debian, CentOS, AlmaLinux, Rocky Linux, and more. Windows Server is available upon request.",
    },
    {
      question: "Do you provide backups?",
      answer:
        "Automatic daily backups can be enabled for any server. We retain backups for 7 days, and you can restore or download them at any time.",
    },
    {
      question: "What is your refund policy?",
      answer:
        "We offer a 7-day money-back guarantee for new accounts. If you're not satisfied, contact support within 7 days of your first deposit for a full refund.",
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground">
            Everything you need to know about OzVPS
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border border-white/10 rounded-xl px-6 bg-white/5 dark:bg-white/5 backdrop-blur-xl data-[state=open]:bg-white/10"
            >
              <AccordionTrigger className="text-left hover:no-underline py-4">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// CTA Banner
function CTABanner({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-primary p-8 sm:p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
            Ready to deploy your Australian VPS?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses running on OzVPS. Get started in under
            60 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href={isLoggedIn ? "/deploy" : "/register"}>
              <Button
                size="lg"
                className="px-8 h-12 bg-white text-primary hover:bg-white/90"
              >
                Get Started
              </Button>
            </Link>
            <a href="mailto:sales@ozvps.com.au">
              <Button
                size="lg"
                variant="outline"
                className="px-8 h-12 border-white/30 text-primary-foreground hover:bg-white/10"
              >
                Contact Sales
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src={logo}
              alt="OzVPS"
              className="h-10 w-auto dark:invert-0 invert"
            />
            <span className="text-sm text-muted-foreground">
              Australian VPS Hosting
            </span>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <a href="mailto:support@ozvps.com.au" className="hover:text-foreground transition-colors">
              Support
            </a>
            <a href="mailto:sales@ozvps.com.au" className="hover:text-foreground transition-colors">
              Sales
            </a>
          </div>

          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} OzVPS. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}

// Main Home Page Component
export default function HomePage() {
  const { data: authData } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.getAuthUser(),
    retry: false,
  });

  const { data: plansData, isLoading: plansLoading } = useQuery<{
    plans: Plan[];
  }>({
    queryKey: ["plans"],
    queryFn: () => api.getPlans(),
  });

  const isLoggedIn = !!authData?.user;
  const plans = plansData?.plans || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header isLoggedIn={isLoggedIn} />
      <main>
        <HeroSection isLoggedIn={isLoggedIn} />
        <StatsBar />
        <PricingSection
          plans={plans}
          isLoading={plansLoading}
          isLoggedIn={isLoggedIn}
        />
        <FeaturesSection />
        <DatacenterSection />
        <FAQSection />
        <CTABanner isLoggedIn={isLoggedIn} />
      </main>
      <Footer />
    </div>
  );
}
