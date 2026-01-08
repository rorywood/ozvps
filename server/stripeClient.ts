import Stripe from 'stripe';

interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
}

let cachedConfig: StripeConfig | null = null;
let connectionSettings: any;

function isReplitEnvironment(): boolean {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL;
  return !!(hostname && xReplitToken);
}

async function getCredentialsFromReplit(): Promise<StripeConfig> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
    webhookSecret: connectionSettings.settings.webhook_secret,
  };
}

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

async function resolveStripeConfig(): Promise<StripeConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (isReplitEnvironment()) {
    cachedConfig = await getCredentialsFromReplit();
  } else {
    cachedConfig = getCredentialsFromEnv();
  }

  return cachedConfig;
}

export async function getUncachableStripeClient() {
  const { secretKey } = await resolveStripeConfig();
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await resolveStripeConfig();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await resolveStripeConfig();
  return secretKey;
}

export async function getStripeWebhookSecret(): Promise<string | undefined> {
  const { webhookSecret } = await resolveStripeConfig();
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
