import Stripe from 'stripe';

interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
}

let cachedConfig: StripeConfig | null = null;

function getCredentialsFromEnv(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !publishableKey) {
    throw new Error(
      'Stripe configuration missing. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables.'
    );
  }

  return {
    publishableKey,
    secretKey,
    webhookSecret,
  };
}

function resolveStripeConfig(): StripeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = getCredentialsFromEnv();
  return cachedConfig;
}

export async function getUncachableStripeClient() {
  const { secretKey } = resolveStripeConfig();
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = resolveStripeConfig();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = resolveStripeConfig();
  return secretKey;
}

export async function getStripeWebhookSecret(): Promise<string | undefined> {
  const { webhookSecret } = resolveStripeConfig();
  return webhookSecret;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
