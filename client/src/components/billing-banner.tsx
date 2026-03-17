import { Info, AlertTriangle, AlertCircle, Wallet } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface BillingBannerProps {
  servers: any[];
  walletBalance: number;
  walletLoaded: boolean;
}

function getDaysUntil(nextBillAt: string): number {
  const billDate = new Date(nextBillAt);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const billDateUTC = Date.UTC(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
  return Math.round((billDateUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BillingBanner({ servers, walletBalance, walletLoaded }: BillingBannerProps) {
  const dueToday = servers.filter(s => {
    const b = s.billing;
    if (!b || (b.status !== 'active' && b.status !== 'paid') || b.isTrial || b.freeServer || !b.nextBillAt) return false;
    return getDaysUntil(b.nextBillAt) === 0;
  });

  const overdue = servers.filter(s => {
    const b = s.billing;
    if (!b || (b.status !== 'active' && b.status !== 'paid') || b.isTrial || b.freeServer || !b.nextBillAt) return false;
    return getDaysUntil(b.nextBillAt) < 0;
  });

  const unpaid = servers.filter(s => s.billing?.status === 'unpaid');

  const billingSuspended = servers.filter(s =>
    s.billing?.status === 'suspended' && !s.billing?.adminSuspended
  );

  const dueTodayAmount = dueToday.reduce((sum, s) => sum + (s.billing?.monthlyPriceCents || 0), 0);
  const overdueAmount = [...overdue, ...unpaid].reduce((sum, s) => sum + (s.billing?.monthlyPriceCents || 0), 0);
  const suspendedAmount = billingSuspended.reduce((sum, s) => sum + (s.billing?.monthlyPriceCents || 0), 0);

  const walletCoversToday = walletBalance >= dueTodayAmount;
  const walletCoversOverdue = walletBalance >= overdueAmount;

  // Servers needing attention in the insufficient funds banner
  // If wallet can't cover "due today", fold them into the insufficient funds banner
  const insufficientServers = [
    ...(dueToday.length > 0 && walletLoaded && !walletCoversToday ? dueToday : []),
    ...overdue,
    ...unpaid,
  ];
  const insufficientAmount = insufficientServers.reduce((sum, s) => sum + (s.billing?.monthlyPriceCents || 0), 0);
  const showInsufficientFunds = insufficientServers.length > 0 && !walletCoversOverdue;
  const nextSuspensionDate = unpaid
    .map((s) => s.billing?.suspendAt)
    .filter((date): date is string => !!date)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

  const showDueToday = dueToday.length > 0 && walletLoaded && walletCoversToday;
  const showSuspended = billingSuspended.length > 0;

  if (!showDueToday && !showInsufficientFunds && !showSuspended) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Due Today — wallet covers it, no action needed */}
      {showDueToday && (
        <div className="border border-primary/30 bg-primary/8 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">Upcoming Payment</h3>
              <p className="text-sm text-muted-foreground">
                {dueToday.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    <span className="text-foreground font-medium">{s.name || `Server #${s.id}`}</span>
                  </span>
                ))}{" "}
                will be charged automatically today —{" "}
                <span className="font-semibold text-foreground">{formatCurrency(dueTodayAmount)}</span>{" "}
                will be deducted from your wallet. No action needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Funds — wallet can't cover overdue/unpaid/due-today */}
      {showInsufficientFunds && (
        <div className="border border-warning/30 bg-warning/8 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">Insufficient Funds</h3>
                <p className="text-sm text-muted-foreground">
                  Your wallet balance is too low to cover{" "}
                  {insufficientServers.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <span className="text-foreground font-medium">{s.name || `Server #${s.id}`}</span>
                    </span>
                  ))}
                  {insufficientAmount > 0 && (
                    <> ({formatCurrency(insufficientAmount)})</>
                  )}
                  . Please add funds to avoid suspension.
                  {nextSuspensionDate && (
                    <> Next suspension date: <span className="font-semibold text-foreground">{formatDateShort(nextSuspensionDate)}</span>.</>
                  )}
                </p>
              </div>
            </div>
            <Button size="sm" asChild className="shrink-0 bg-warning/15 border border-warning/40 text-warning hover:bg-warning/25">
              <Link href="/billing">
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                Add Funds
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Billing Suspended */}
      {showSuspended && (
        <div className="border border-destructive/30 bg-destructive/8 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">Server Suspended</h3>
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {billingSuspended.length} server{billingSuspended.length !== 1 ? 's' : ''}
                  </span>{" "}
                  suspended due to non-payment
                  {suspendedAmount > 0 && (
                    <> ({formatCurrency(suspendedAmount)} due)</>
                  )}
                  . Add funds, then reactivate the affected server{billingSuspended.length !== 1 ? 's' : ''} from the billing page.
                </p>
              </div>
            </div>
            <Button size="sm" variant="destructive" asChild className="shrink-0">
              <Link href="/billing">
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                Add Funds
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
