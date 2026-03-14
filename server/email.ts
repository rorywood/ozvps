import { Resend } from 'resend';
import { log } from './logger';

// Resend API key from environment - NEVER hardcode API keys!
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'OzVPS <noreply@ozvps.com.au>';

// Validate Resend configuration
if (!RESEND_API_KEY) {
  log('RESEND_API_KEY not configured - password reset emails will fail', 'email', { level: 'warn' });
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const ff = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const blue = '#2563eb';
const green = '#059669';
const red = '#dc2626';
const amber = '#d97706';
const textDark = '#111827';
const textMuted = '#6b7280';
const textLight = '#9ca3af';
const border = '#e5e7eb';
const bgLight = '#f9fafb';

function getLogoUrl(): string {
  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  return `${appUrl}/logo-email.png`;
}

/** Shared white email shell — blue top accent, logo, content, footer */
function baseEmail(bodyHtml: string, logoUrl: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:${bgLight};font-family:${ff};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgLight};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:10px;border:1px solid ${border};overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Blue accent line -->
                <tr><td style="height:4px;background-color:${blue};font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- Logo -->
                <tr>
                  <td style="padding:28px 40px;text-align:center;border-bottom:1px solid ${border};">
                    <img src="${logoUrl}" alt="OzVPS" width="120" height="auto" style="display:block;margin:0 auto;">
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:36px 40px;">
                    ${bodyHtml}
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid ${border};">
                    <p style="margin:0 0 4px;color:${textLight};font-size:13px;">© ${year} OzVPS Pty Ltd · Australian owned and operated</p>
                    <p style="margin:0;color:${textLight};font-size:12px;">Brisbane, QLD · <a href="https://ozvps.com.au" style="color:${textLight};text-decoration:none;">ozvps.com.au</a></p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Reusable info/data table row */
function row(label: string, value: string, isLast = false): string {
  const bottom = isLast ? '' : `border-bottom:1px solid ${border};`;
  return `<tr>
    <td style="padding:12px 16px;${bottom}color:${textMuted};font-size:13px;white-space:nowrap;">${label}</td>
    <td style="padding:12px 16px;${bottom}color:${textDark};font-size:13px;font-weight:600;text-align:right;">${value}</td>
  </tr>`;
}

/** Reusable credentials row */
function credRow(label: string, value: string, mono = false): string {
  const font = mono ? `font-family:'Courier New',Courier,monospace;` : '';
  return `<tr>
    <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">${label}</td>
    <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${textDark};font-size:14px;font-weight:600;${font}word-break:break-all;">${value}</td>
  </tr>`;
}

/** Alert box (info, warning, danger) */
function alertBox(type: 'info' | 'warning' | 'danger', heading: string, text: string): string {
  const colors = { info: blue, warning: amber, danger: red };
  const bgs = { info: '#eff6ff', warning: '#fffbeb', danger: '#fef2f2' };
  const c = colors[type];
  const bg = bgs[type];
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${c};background-color:${bg};border-radius:0 6px 6px 0;margin-bottom:24px;">
    <tr>
      <td style="padding:14px 16px;">
        <p style="margin:0 0 4px;color:${c};font-size:13px;font-weight:600;">${heading}</p>
        <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">${text}</p>
      </td>
    </tr>
  </table>`;
}

/** CTA button */
function btn(href: string, label: string, color = blue): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
    <tr>
      <td style="border-radius:6px;background-color:${color};">
        <a href="${href}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ─── Helpers end ────────────────────────────────────────────────────────────

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  expiresInMinutes: number = 30
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send password reset email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const logoUrl = getLogoUrl();

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Reset Your Password</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">We received a request to reset the password for your OzVPS account. Click the button below to set a new password.</p>
    ${btn(resetLink, 'Reset Password')}
    <p style="margin:0 0 24px;color:${textMuted};font-size:14px;line-height:1.6;">This link expires in <strong style="color:${textDark};">${expiresInMinutes} minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
    <div style="border-top:1px solid ${border};padding-top:20px;">
      <p style="margin:0 0 6px;color:${textLight};font-size:12px;">If the button doesn't work, copy and paste this link:</p>
      <p style="margin:0;word-break:break-all;"><a href="${resetLink}" style="color:${blue};font-size:12px;text-decoration:none;">${resetLink}</a></p>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Reset Your OzVPS Password',
      html: baseEmail(body, logoUrl),
      text: `Reset Your OzVPS Password\n\nWe received a request to reset your password.\n\n${resetLink}\n\nThis link expires in ${expiresInMinutes} minutes.\n\nIf you didn't request this, ignore this email.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send password reset email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Password reset email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending password reset email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send email verification email
 */
export async function sendEmailVerificationEmail(
  to: string,
  verifyLink: string,
  expiresInHours: number = 24
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send email verification email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const logoUrl = getLogoUrl();

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Verify Your Email Address</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">Thanks for signing up with OzVPS. Click the button below to verify your email address and activate your account.</p>
    ${btn(verifyLink, 'Verify Email Address')}
    <p style="margin:0 0 24px;color:${textMuted};font-size:14px;line-height:1.6;">This link expires in <strong style="color:${textDark};">${expiresInHours} hours</strong>. If you didn't create an OzVPS account, you can ignore this email.</p>
    <div style="border-top:1px solid ${border};padding-top:20px;">
      <p style="margin:0 0 6px;color:${textLight};font-size:12px;">If the button doesn't work, copy and paste this link:</p>
      <p style="margin:0;word-break:break-all;"><a href="${verifyLink}" style="color:${blue};font-size:12px;text-decoration:none;">${verifyLink}</a></p>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Verify Your OzVPS Email Address',
      html: baseEmail(body, logoUrl),
      text: `Verify Your OzVPS Email Address\n\nClick the link below to verify your email:\n\n${verifyLink}\n\nThis link expires in ${expiresInHours} hours.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send verification email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Verification email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending verification email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send server credentials email (new server deployed)
 */
export async function sendServerCredentialsEmail(
  to: string,
  serverName: string,
  serverIp: string,
  username: string,
  password: string,
  osName: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send server credentials email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${green};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Server Ready</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Your Server Is Online</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">Your <strong style="color:${textDark};">${osName}</strong> server <strong style="color:${textDark};">${serverName}</strong> is now live and ready to use. Your login credentials are below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${credRow('Server Name', serverName)}
      ${credRow('IP Address', serverIp, true)}
      ${credRow('Username', username, true)}
      <tr>
        <td style="padding:10px 16px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Password</td>
        <td style="padding:10px 16px;color:${textDark};font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;word-break:break-all;">${password}</td>
      </tr>
    </table>

    ${alertBox('warning', 'Security Reminder', 'Please change your password after your first login. Store your credentials somewhere safe.')}
    ${btn(`${appUrl}/servers`, 'View My Servers')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Your server ${serverName} is ready`,
      html: baseEmail(body, logoUrl),
      text: `Your Server Is Online\n\nServer: ${serverName}\nOS: ${osName}\nIP: ${serverIp}\nUsername: ${username}\nPassword: ${password}\n\nChange your password after first login.\n\nManage servers: ${appUrl}/servers\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send server credentials email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Server credentials email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server credentials email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send server reinstall email (OS reinstalled)
 */
export async function sendServerReinstallEmail(
  to: string,
  serverName: string,
  serverIp: string,
  username: string,
  password: string,
  osName: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send server reinstall email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${blue};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reinstall Complete</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Server Reinstalled</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">Your server <strong style="color:${textDark};">${serverName}</strong> has been reinstalled with <strong style="color:${textDark};">${osName}</strong>. Your new login credentials are below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${credRow('Server Name', serverName)}
      ${credRow('IP Address', serverIp, true)}
      ${credRow('Username', username, true)}
      <tr>
        <td style="padding:10px 16px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Password</td>
        <td style="padding:10px 16px;color:${textDark};font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;word-break:break-all;">${password}</td>
      </tr>
    </table>

    ${alertBox('warning', 'Note', 'All previous data on this server has been wiped. Your old credentials no longer work.')}
    ${btn(`${appUrl}/servers`, 'View My Servers')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Your server ${serverName} has been reinstalled`,
      html: baseEmail(body, logoUrl),
      text: `Server Reinstalled\n\nServer: ${serverName}\nOS: ${osName}\nIP: ${serverIp}\nUsername: ${username}\nPassword: ${password}\n\nAll previous data has been wiped.\n\nManage servers: ${appUrl}/servers\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send server reinstall email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Server reinstall email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server reinstall email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send password changed confirmation email
 */
export async function sendPasswordChangedEmail(to: string): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send password changed email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const logoUrl = getLogoUrl();

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Password Changed</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">Your OzVPS account password has been successfully updated.</p>
    ${alertBox('warning', 'Wasn\'t you?', 'If you did not make this change, please contact us immediately at <a href="mailto:support@ozvps.com.au" style="color:${blue};text-decoration:none;">support@ozvps.com.au</a>')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Your OzVPS Password Has Been Changed',
      html: baseEmail(body, logoUrl),
      text: `Password Changed\n\nYour OzVPS account password has been successfully updated.\n\nIf you did not make this change, contact us at support@ozvps.com.au immediately.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send password changed email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Password changed email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending password changed email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send billing reminder email (payment due tomorrow)
 */
export async function sendBillingReminderEmail(
  to: string,
  serverName: string,
  amountDollars: string,
  dueDate: string,
  walletBalance: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send billing reminder email', 'email');
    return { success: false, error: 'Email service not configured.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${amber};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Payment Reminder</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Payment Due Tomorrow</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Your server <strong style="color:${textDark};">${serverName}</strong> is due for renewal tomorrow. We'll automatically charge your wallet — make sure you have sufficient funds.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Amount Due', amountDollars)}
      ${row('Due Date', dueDate)}
      ${row('Wallet Balance', walletBalance, true)}
    </table>

    ${btn(`${appUrl}/billing`, 'Top Up Wallet')}
    <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">If your wallet has insufficient funds when the payment is due, your server will be suspended.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Payment due tomorrow for ${serverName}`,
      html: baseEmail(body, logoUrl),
      text: `Payment Due Tomorrow\n\nServer: ${serverName}\nAmount Due: ${amountDollars}\nDue Date: ${dueDate}\nWallet Balance: ${walletBalance}\n\nTop up your wallet: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send billing reminder email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Billing reminder email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending billing reminder email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send payment failed email
 */
export async function sendPaymentFailedEmail(
  to: string,
  serverName: string,
  amountDollars: string,
  suspendDate: string,
  daysUntilSuspension: number
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send payment failed email', 'email');
    return { success: false, error: 'Email service not configured.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${red};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Action Required</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Payment Failed</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">We were unable to charge your wallet for <strong style="color:${textDark};">${serverName}</strong> due to insufficient funds. Please top up now to avoid suspension.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Amount Due', amountDollars)}
      ${row('Suspension Date', suspendDate)}
      ${row('Days Remaining', `${daysUntilSuspension} day${daysUntilSuspension !== 1 ? 's' : ''}`, true)}
    </table>

    ${alertBox('danger', 'Your server will be suspended', `Add at least ${amountDollars} to your wallet before ${suspendDate} to keep your server online.`)}
    ${btn(`${appUrl}/billing`, 'Top Up Wallet', red)}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Action required: Payment failed for ${serverName}`,
      html: baseEmail(body, logoUrl),
      text: `Payment Failed\n\nServer: ${serverName}\nAmount Due: ${amountDollars}\nSuspension Date: ${suspendDate}\nDays Remaining: ${daysUntilSuspension}\n\nTop up your wallet now: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send payment failed email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Payment failed email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending payment failed email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send server suspended email
 */
export async function sendServerSuspendedEmail(
  to: string,
  serverName: string,
  amountDollars: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send server suspended email', 'email');
    return { success: false, error: 'Email service not configured.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${red};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Server Suspended</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Your Server Has Been Suspended</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Your server <strong style="color:${textDark};">${serverName}</strong> has been suspended due to non-payment. Add <strong style="color:${textDark};">${amountDollars}</strong> or more to your wallet to restore access.</p>

    ${alertBox('info', 'How to restore your server', `Top up your wallet with at least ${amountDollars}. Your server will be automatically unsuspended once payment is processed.`)}
    ${btn(`${appUrl}/billing`, 'Top Up Wallet')}
    <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">If you continue to have issues, please <a href="${appUrl}/support" style="color:${blue};text-decoration:none;">contact our support team</a>.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Server suspended: ${serverName}`,
      html: baseEmail(body, logoUrl),
      text: `Server Suspended\n\nYour server ${serverName} has been suspended due to non-payment.\n\nTop up ${amountDollars} to restore: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send server suspended email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Server suspended email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server suspended email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send admin notification of new support ticket
 */
export async function sendAdminTicketNotificationEmail(
  ticketId: number,
  title: string,
  category: string,
  priority: string,
  description: string,
  userEmail: string,
  userName: string | null
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send admin ticket notification', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const adminEmails = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmails) {
    log('ADMIN_NOTIFICATION_EMAIL not configured - skipping admin notification', 'email');
    return { success: false, error: 'Admin notification email not configured' };
  }

  const adminEmailList = adminEmails.split(',').map(e => e.trim()).filter(e => e);
  if (adminEmailList.length === 0) {
    log('No admin emails configured - skipping notification', 'email');
    return { success: false, error: 'No admin emails configured' };
  }

  const adminUrl = process.env.ADMIN_URL || 'https://admin.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const priorityColors: Record<string, string> = {
    low: '#6b7280', normal: blue, high: amber, urgent: red,
  };
  const pColor = priorityColors[priority] || blue;

  const body = `
    <p style="margin:0 0 4px;color:${blue};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">New Support Ticket</p>
    <h1 style="margin:0 0 20px;color:${textDark};font-size:22px;font-weight:700;">${title}</h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Ticket', `#${ticketId}`)}
      ${row('From', `${userName ? `${userName} — ` : ''}${userEmail}`)}
      ${row('Category', category.charAt(0).toUpperCase() + category.slice(1))}
      <tr>
        <td style="padding:12px 16px;border-bottom:0;color:${textMuted};font-size:13px;white-space:nowrap;">Priority</td>
        <td style="padding:12px 16px;border-bottom:0;text-align:right;">
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;background-color:${pColor};color:#fff;font-size:12px;font-weight:600;">${priority.toUpperCase()}</span>
        </td>
      </tr>
    </table>

    <div style="background-color:${bgLight};border-radius:6px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
      <p style="margin:0;color:${textDark};font-size:14px;line-height:1.7;white-space:pre-wrap;">${description}</p>
    </div>

    ${btn(`${adminUrl}/tickets`, 'View in Admin Panel')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: adminEmailList,
      subject: `[${priority.toUpperCase()}] New Support Ticket #${ticketId}: ${title}`,
      html: baseEmail(body, logoUrl),
      text: `New Support Ticket #${ticketId}\n\nTitle: ${title}\nFrom: ${userName || ''} <${userEmail}>\nCategory: ${category}\nPriority: ${priority}\n\n${description}\n\nView: ${adminUrl}/tickets\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send admin ticket notification: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Admin ticket notification sent for ticket #${ticketId}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending admin ticket notification: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send ticket confirmation to user
 */
export async function sendTicketConfirmationEmail(
  to: string,
  ticketId: number,
  title: string,
  category: string,
  priority: string,
  userName: string | null
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send ticket confirmation', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const ticketUrl = `${appUrl}/support/${ticketId}`;
  const logoUrl = getLogoUrl();

  const categoryLabels: Record<string, string> = {
    sales: 'Sales', accounts: 'Accounts', support: 'Technical Support', abuse: 'Abuse Report',
  };

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">We've Received Your Request</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Hi${userName ? ` ${userName}` : ''}, your support ticket has been created and our team has been notified. We'll get back to you as soon as possible.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Ticket Number', `#${ticketId}`)}
      ${row('Subject', title)}
      ${row('Category', categoryLabels[category] || category)}
      ${row('Priority', priority.charAt(0).toUpperCase() + priority.slice(1), true)}
    </table>

    <p style="margin:0 0 20px;color:${textMuted};font-size:14px;line-height:1.6;">You can reply to this email to add more information to your ticket, or view it online:</p>
    ${btn(ticketUrl, 'View Your Ticket')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      replyTo: `support+${ticketId}@ozvps.com.au`,
      subject: `[Ticket #${ticketId}] ${title}`,
      html: baseEmail(body, logoUrl),
      text: `We've Received Your Request\n\nTicket: #${ticketId}\nSubject: ${title}\nCategory: ${categoryLabels[category] || category}\nPriority: ${priority}\n\nReply to this email to add more information, or view online:\n${ticketUrl}\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send ticket confirmation to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Ticket confirmation sent to ${to} for ticket #${ticketId}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending ticket confirmation to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send guest ticket confirmation (no account required)
 */
export async function sendGuestTicketConfirmationEmail(
  to: string,
  ticketId: number,
  title: string,
  accessToken: string,
  userName: string | null
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send guest ticket confirmation', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const ticketUrl = `${appUrl}/support/guest/${accessToken}`;
  const logoUrl = getLogoUrl();

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">We've Received Your Request</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Hi${userName ? ` ${userName}` : ''}, your support ticket has been created. You don't need an account — use the link below to view and track your ticket.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Ticket Number', `#${ticketId}`)}
      ${row('Subject', title, true)}
    </table>

    ${btn(ticketUrl, 'View Your Ticket')}
    <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">You can also reply directly to this email to add more information to your ticket.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      replyTo: `support+${ticketId}@ozvps.com.au`,
      subject: `[Ticket #${ticketId}] ${title}`,
      html: baseEmail(body, logoUrl),
      text: `We've Received Your Request\n\nTicket: #${ticketId}\nSubject: ${title}\n\nView your ticket:\n${ticketUrl}\n\nOr reply to this email to add more information.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send guest ticket confirmation to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Guest ticket confirmation sent to ${to} for ticket #${ticketId}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending guest ticket confirmation to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Notify guest ticket author that admin has replied
 */
export async function sendGuestTicketAdminReplyEmail(
  to: string,
  ticketId: number,
  title: string,
  accessToken: string,
  adminReplyMessage: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send guest ticket reply notification', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const ticketUrl = `${appUrl}/support/guest/${accessToken}`;
  const logoUrl = getLogoUrl();
  const preview = adminReplyMessage.length > 300 ? adminReplyMessage.slice(0, 300) + '...' : adminReplyMessage;

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">New Reply on Your Ticket</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Our support team has replied to your ticket. Click below to view the conversation and respond.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Ticket', `#${ticketId}`)}
      ${row('Subject', title, true)}
    </table>

    <div style="background:#f9fafb;border:1px solid ${border};border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:${textMuted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reply Preview</p>
      <p style="margin:0;color:${textDark};font-size:14px;line-height:1.6;white-space:pre-wrap;">${preview}</p>
    </div>

    ${btn(ticketUrl, 'View & Reply')}
    <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">You can also reply directly to this email to respond to the ticket.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      replyTo: `support+${ticketId}@ozvps.com.au`,
      subject: `[Ticket #${ticketId}] ${title}`,
      html: baseEmail(body, logoUrl),
      text: `New Reply on Your Ticket\n\nTicket: #${ticketId}\nSubject: ${title}\n\nOur support team has replied. View and reply here:\n${ticketUrl}\n\nOr reply directly to this email.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send guest ticket reply notification to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Guest ticket reply notification sent to ${to} for ticket #${ticketId}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending guest ticket reply notification to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send two-factor authentication code email
 */
export async function sendTwoFactorCodeEmail(
  to: string,
  code: string,
  expiresInMinutes: number = 10
): Promise<EmailResult> {
  if (!resend) {
    log('Cannot send 2FA code email: Resend not configured', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const logoUrl = getLogoUrl();

  const body = `
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;text-align:center;">Verification Code</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;text-align:center;">Enter this code to complete your sign-in to OzVPS:</p>

    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background-color:${bgLight};border:2px solid ${border};border-radius:10px;padding:20px 32px;">
        <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:${blue};font-family:'Courier New',Courier,monospace;">${code}</span>
      </div>
    </div>

    <p style="margin:0 0 0;color:${textMuted};font-size:14px;line-height:1.6;text-align:center;">This code expires in <strong style="color:${textDark};">${expiresInMinutes} minutes</strong>. If you didn't try to sign in, you can ignore this email.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `${code} is your OzVPS verification code`,
      html: baseEmail(body, logoUrl),
      text: `Your OzVPS verification code: ${code}\n\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you didn't request this, ignore this email.\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send 2FA code email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`2FA code email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending 2FA code email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send server root password reset email
 */
export async function sendServerPasswordResetEmail(
  to: string,
  serverName: string,
  serverIp: string,
  username: string,
  password: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send password reset email', 'email');
    return { success: false, error: 'Email service not configured. Please contact administrator.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${blue};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Password Reset Complete</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Server Password Reset</h1>
    <p style="margin:0 0 28px;color:${textMuted};font-size:15px;line-height:1.6;">The root password for <strong style="color:${textDark};">${serverName}</strong> has been reset. Your new credentials are below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${credRow('Server Name', serverName)}
      ${credRow('IP Address', serverIp, true)}
      ${credRow('Username', username, true)}
      <tr>
        <td style="padding:10px 16px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Password</td>
        <td style="padding:10px 16px;color:${textDark};font-size:14px;font-weight:600;font-family:'Courier New',Courier,monospace;word-break:break-all;">${password}</td>
      </tr>
    </table>

    ${btn(`${appUrl}/servers`, 'Go to My Servers')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Password Reset - ${serverName}`,
      html: baseEmail(body, logoUrl),
      text: `Server Password Reset\n\nServer: ${serverName}\nIP: ${serverIp}\nUsername: ${username}\nPassword: ${password}\n\nManage servers: ${appUrl}/servers\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send server password reset email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Server password reset email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server password reset email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send ticket status update email (resolved or closed)
 */
export async function sendTicketStatusEmail(
  to: string,
  ticketId: number,
  ticketTitle: string,
  newStatus: 'resolved' | 'closed',
  adminMessage?: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send ticket status email', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const ticketUrl = `${appUrl}/support/tickets/${ticketId}`;
  const logoUrl = getLogoUrl();

  const statusConfig = {
    resolved: {
      subject: `Ticket #${ticketId} Resolved: ${ticketTitle}`,
      label: 'Ticket Resolved',
      labelColor: green,
      heading: 'Your Ticket Has Been Resolved',
      message: 'Our support team has marked your ticket as resolved. If you have further questions or the issue persists, you can reopen the ticket within 7 days.',
    },
    closed: {
      subject: `Ticket #${ticketId} Closed: ${ticketTitle}`,
      label: 'Ticket Closed',
      labelColor: textMuted,
      heading: 'Your Ticket Has Been Closed',
      message: 'This support ticket has been closed. If you need further assistance, please create a new ticket.',
    },
  };

  const cfg = statusConfig[newStatus];

  const body = `
    <p style="margin:0 0 4px;color:${cfg.labelColor};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${cfg.label}</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">${cfg.heading}</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">${cfg.message}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Ticket', `#${ticketId}`)}
      ${row('Subject', ticketTitle, true)}
    </table>

    ${adminMessage ? `<div style="background-color:${bgLight};border-radius:6px;padding:16px;margin-bottom:24px;"><p style="margin:0 0 8px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Message from Support</p><p style="margin:0;color:${textDark};font-size:14px;line-height:1.7;">${adminMessage}</p></div>` : ''}
    ${btn(ticketUrl, 'View Ticket')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `[OzVPS] ${cfg.subject}`,
      html: baseEmail(body, logoUrl),
      text: `${cfg.heading}\n\nTicket: #${ticketId}\nSubject: ${ticketTitle}\n\n${cfg.message}${adminMessage ? `\n\nSupport message: ${adminMessage}` : ''}\n\nView ticket: ${ticketUrl}\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send ticket status email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Ticket status email (${newStatus}) sent to ${to} for ticket #${ticketId}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending ticket status email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send trial ended email
 */
export async function sendTrialEndedEmail(
  to: string,
  serverName: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send trial ended email', 'email');
    return { success: false, error: 'Email service not configured.' };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${amber};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Trial Ended</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Your Trial Has Ended</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Your free trial for <strong style="color:${textDark};">${serverName}</strong> has ended and the server has been powered off.</p>

    ${alertBox('info', 'Keep your server', `Top up your wallet and purchase a plan to keep ${serverName} running. Your data is still intact.`)}
    ${btn(`${appUrl}/billing`, 'Top Up & Continue')}
    <p style="margin:0;color:${textMuted};font-size:13px;line-height:1.6;">Questions? <a href="${appUrl}/support" style="color:${blue};text-decoration:none;">Contact our support team</a>.</p>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Your trial has ended: ${serverName}`,
      html: baseEmail(body, logoUrl),
      text: `Your Trial Has Ended\n\nYour trial for ${serverName} has ended. The server has been powered off.\n\nTop up your wallet to continue: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send trial ended email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Trial ended email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending trial ended email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send bug report email to internal team
 */
export async function sendBugReportEmail(
  description: string,
  userEmail: string,
  userName: string | null,
  userAgent: string,
  currentUrl: string,
  appVersion: string
): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send bug report', 'email');
    return { success: false, error: 'Email service not configured' };
  }

  const logoUrl = getLogoUrl();
  const submittedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane',
    dateStyle: 'full',
    timeStyle: 'long'
  });

  const body = `
    <p style="margin:0 0 4px;color:${red};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Bug Report</p>
    <h1 style="margin:0 0 20px;color:${textDark};font-size:22px;font-weight:700;">OzVPS Panel — Bug Report</h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Submitted By', `${userName ? `${userName} — ` : ''}${userEmail}`)}
      ${row('App Version', appVersion)}
      ${row('URL', currentUrl)}
      ${row('Submitted At', submittedAt, true)}
    </table>

    <div style="background-color:${bgLight};border-radius:6px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
      <p style="margin:0;color:${textDark};font-size:14px;line-height:1.7;white-space:pre-wrap;">${description}</p>
    </div>

    <div style="background-color:${bgLight};border-radius:6px;padding:12px 16px;">
      <p style="margin:0 0 4px;color:${textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">User Agent</p>
      <p style="margin:0;color:${textMuted};font-size:12px;font-family:'Courier New',Courier,monospace;word-break:break-all;">${userAgent}</p>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: ['support@cloudasn.com'],
      replyTo: userEmail,
      subject: `[Bug Report] OzVPS Panel - ${userName || userEmail}`,
      html: baseEmail(body, logoUrl),
      text: `Bug Report\n\nFrom: ${userName || ''} <${userEmail}>\nVersion: ${appVersion}\nURL: ${currentUrl}\nSubmitted: ${submittedAt}\n\nDescription:\n${description}\n\nUser Agent: ${userAgent}`,
    });
    if (error) { log(`Failed to send bug report email: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Bug report email sent from ${userEmail}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending bug report email: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send auto top-up success email
 */
export async function sendAutoTopupSuccessEmail(
  to: string,
  amountCharged: string,
  newBalance: string
): Promise<EmailResult> {
  if (!resend) return { success: false, error: 'Email service not configured.' };

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${green};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Auto Top-Up</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Wallet Topped Up</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">Your wallet was automatically topped up to cover a server charge.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Amount Charged', amountCharged)}
      ${row('New Wallet Balance', newBalance, true)}
    </table>

    ${btn(`${appUrl}/billing`, 'View Billing')}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Auto top-up of ${amountCharged} was successful`,
      html: baseEmail(body, logoUrl),
      text: `Auto Top-Up Successful\n\nAmount Charged: ${amountCharged}\nNew Wallet Balance: ${newBalance}\n\nManage billing: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send auto top-up success email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Auto top-up success email sent to ${to}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending auto top-up success email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send auto top-up failed email
 */
export async function sendAutoTopupFailedEmail(
  to: string,
  attemptedAmount: string,
  reason: string
): Promise<EmailResult> {
  if (!resend) return { success: false, error: 'Email service not configured.' };

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  const body = `
    <p style="margin:0 0 4px;color:${red};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Action Required</p>
    <h1 style="margin:0 0 12px;color:${textDark};font-size:22px;font-weight:700;">Auto Top-Up Failed</h1>
    <p style="margin:0 0 24px;color:${textMuted};font-size:15px;line-height:1.6;">We attempted to automatically top up your wallet but the payment was unsuccessful. Your servers may be at risk of suspension.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;margin-bottom:24px;border-collapse:collapse;">
      ${row('Attempted Amount', attemptedAmount)}
      ${row('Reason', reason, true)}
    </table>

    ${alertBox('danger', 'Top up manually', 'Please add funds to your wallet to keep your servers running.')}
    ${btn(`${appUrl}/billing`, 'Top Up Wallet', red)}`;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Action required: Auto top-up of ${attemptedAmount} failed`,
      html: baseEmail(body, logoUrl),
      text: `Auto Top-Up Failed\n\nAttempted Amount: ${attemptedAmount}\nReason: ${reason}\n\nPlease top up manually: ${appUrl}/billing\n\n© ${new Date().getFullYear()} OzVPS Pty Ltd.`,
    });
    if (error) { log(`Failed to send auto top-up failed email to ${to}: ${error.message}`, 'email'); return { success: false, error: error.message }; }
    log(`Auto top-up failed email sent to ${to}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending auto top-up failed email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}
