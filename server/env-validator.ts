/**
 * Environment Variable Validation
 * Ensures all required configuration is present before starting the application
 */

interface EnvConfig {
  // Database
  DATABASE_URL: string;

  // Auth0
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  AUTH0_WEBHOOK_SECRET?: string; // Recommended but not required

  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string; // Recommended but not required

  // VirtFusion
  VIRTFUSION_PANEL_URL: string;
  VIRTFUSION_API_TOKEN: string;

  // Security
  SESSION_SECRET?: string; // Recommended but not required
  TOTP_ENCRYPTION_KEY?: string; // Optional but recommended

  // Email
  RESEND_API_KEY?: string; // Optional but needed for password reset

  // Optional
  REDIS_URL?: string;
  REDIS_PASSWORD?: string;
  EMAIL_FROM?: string;
  PORT?: string;
  NODE_ENV?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all required environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required variables (core functionality)
  const required: (keyof EnvConfig)[] = [
    'DATABASE_URL',
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'VIRTFUSION_PANEL_URL',
    'VIRTFUSION_API_TOKEN',
  ];

  // Recommended variables (warn if missing, but don't block startup)
  const recommended: (keyof EnvConfig)[] = [
    'SESSION_SECRET',
    'AUTH0_WEBHOOK_SECRET',
    'STRIPE_WEBHOOK_SECRET',
  ];

  // Check required variables
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Check recommended variables (warnings only)
  for (const key of recommended) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      warnings.push(`${key} not set - This is recommended for production security and functionality`);
    }
  }

  // Validate SESSION_SECRET length (WARNING only for backwards compatibility)
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret.length < 32) {
    warnings.push('SESSION_SECRET should be at least 32 characters for security (current: ' + sessionSecret.length + ' chars)');
  }

  // Validate TOTP_ENCRYPTION_KEY if provided (WARNING only)
  const totpKey = process.env.TOTP_ENCRYPTION_KEY;
  if (totpKey && totpKey.length < 32) {
    warnings.push('TOTP_ENCRYPTION_KEY should be at least 32 characters for security (current: ' + totpKey.length + ' chars)');
  }

  // Validate DATABASE_URL format
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && !databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string (postgresql://...)');
  }

  // Validate STRIPE keys format
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (stripeSecret && !stripeSecret.startsWith('sk_')) {
    errors.push('STRIPE_SECRET_KEY must start with sk_live_ or sk_test_');
  }

  const stripePublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  if (stripePublishable && !stripePublishable.startsWith('pk_')) {
    errors.push('STRIPE_PUBLISHABLE_KEY must start with pk_live_ or pk_test_');
  }

  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeWebhook && !stripeWebhook.startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
  }

  // Validate VIRTFUSION_PANEL_URL format
  const virtfusionUrl = process.env.VIRTFUSION_PANEL_URL;
  if (virtfusionUrl && !virtfusionUrl.startsWith('http://') && !virtfusionUrl.startsWith('https://')) {
    errors.push('VIRTFUSION_PANEL_URL must be a valid HTTP(S) URL');
  }

  // Validate AUTH0_DOMAIN format
  const auth0Domain = process.env.AUTH0_DOMAIN;
  if (auth0Domain && (auth0Domain.startsWith('http://') || auth0Domain.startsWith('https://'))) {
    errors.push('AUTH0_DOMAIN should be just the domain (e.g., your-app.auth0.com), not a full URL');
  }

  // Warnings for optional but recommended variables
  if (!process.env.TOTP_ENCRYPTION_KEY) {
    warnings.push('TOTP_ENCRYPTION_KEY not set - 2FA secrets will use SESSION_SECRET fallback');
  }

  if (!process.env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY not set - password reset emails will not work');
  }

  if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL not set - using in-memory sessions (will not persist across restarts)');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (stripeSecret && stripeSecret.startsWith('sk_test_')) {
      warnings.push('Using Stripe TEST keys in production! Use sk_live_ keys for production.');
    }

    if (!process.env.REDIS_URL) {
      warnings.push('REDIS_URL not set - using in-memory sessions (will not persist across restarts/instances)');
    }

    if (!process.env.RESEND_API_KEY) {
      warnings.push('RESEND_API_KEY not set - password reset emails will not work');
    }

    // Check for example/placeholder values
    const placeholderPatterns = ['your_', 'example', 'changeme', 'test123'];
    for (const key of required) {
      const value = process.env[key];
      if (value && placeholderPatterns.some(pattern => value.toLowerCase().includes(pattern))) {
        errors.push(`${key} appears to contain a placeholder value. Please set a real value.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and exit if invalid
 */
export function validateOrExit(): void {
  console.log('🔍 Validating environment configuration...\n');

  const result = validateEnvironment();

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  Configuration Warnings:');
    result.warnings.forEach(warning => {
      console.log(`   ⚠️  ${warning}`);
    });
    console.log('');
  }

  // Print errors and exit if invalid
  if (!result.valid) {
    console.error('❌ Environment Validation Failed!\n');
    console.error('   Missing or invalid configuration:');
    result.errors.forEach(error => {
      console.error(`   ❌ ${error}`);
    });
    console.error('\n💡 Fix these issues and try again.');
    console.error('   See .env.example for required variables.\n');
    process.exit(1);
  }

  console.log('✅ Environment validation passed!\n');
}

/**
 * Get a summary of the current environment configuration
 */
export function getEnvironmentSummary(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const hasRedis = !!process.env.REDIS_URL;
  const hasEmail = !!process.env.RESEND_API_KEY;
  const has2FA = !!process.env.TOTP_ENCRYPTION_KEY;
  const stripeMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST';

  return `
Environment: ${nodeEnv}
Stripe Mode: ${stripeMode}
Redis: ${hasRedis ? 'Configured' : 'Memory-only (in-memory sessions)'}
Email: ${hasEmail ? 'Configured (Resend)' : 'Not configured'}
2FA Encryption: ${has2FA ? 'Dedicated key' : 'Using SESSION_SECRET'}
  `.trim();
}
