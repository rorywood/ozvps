import { Resend } from 'resend';
import { log } from './log';

// Resend API key from environment - NEVER hardcode API keys!
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'OzVPS <noreply@ozvps.com.au>';

// Validate Resend configuration
if (!RESEND_API_KEY) {
  console.warn('⚠️  WARNING: RESEND_API_KEY not configured. Password reset emails will fail.');
  console.warn('   Set RESEND_API_KEY in your .env file');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Common email styles - clean, professional, light theme
const emailStyles = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  primaryColor: '#2563eb', // Blue
  successColor: '#059669', // Green
  warningColor: '#d97706', // Amber
  textDark: '#1f2937',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  borderColor: '#e5e7eb',
  bgWhite: '#ffffff',
  bgLight: '#f9fafb',
};

// Logo URL - uses APP_URL if set, otherwise falls back to production
function getLogoUrl(): string {
  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  return `${appUrl}/logo-email.png`;
}

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
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Reset Your OzVPS Password',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">
                <tr>
                  <td style="padding: 40px;">
                    <h1 style="margin: 0 0 16px; color: ${emailStyles.textDark}; font-size: 24px; font-weight: 600;">Reset Your Password</h1>

                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      We received a request to reset the password for your OzVPS account. Click the button below to create a new password.
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0 24px;">
                          <a href="${resetLink}" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 16px; color: ${emailStyles.textMuted}; font-size: 14px; line-height: 1.6;">
                      This link will expire in <strong style="color: ${emailStyles.textDark};">${expiresInMinutes} minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
                    </p>

                    <div style="border-top: 1px solid ${emailStyles.borderColor}; margin: 24px 0 0; padding: 24px 0 0;">
                      <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                        If the button doesn't work, copy and paste this link:
                      </p>
                      <p style="margin: 0; word-break: break-all;">
                        <a href="${resetLink}" style="color: ${emailStyles.primaryColor}; font-size: 13px; text-decoration: none;">${resetLink}</a>
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 12px;">
                Australian owned and operated
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
Reset Your OzVPS Password

We received a request to reset the password for your OzVPS account.

Click the link below to create a new password:
${resetLink}

This link will expire in ${expiresInMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email.

---
© ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
      `.trim(),
    });

    if (error) {
      log(`Failed to send password reset email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

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
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  const logoUrl = getLogoUrl();

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Verify Your OzVPS Email Address',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">
                <tr>
                  <td style="padding: 40px;">
                    <h1 style="margin: 0 0 16px; color: ${emailStyles.textDark}; font-size: 24px; font-weight: 600;">Verify Your Email</h1>

                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Thanks for signing up for OzVPS! Please verify your email address by clicking the button below.
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0 24px;">
                          <a href="${verifyLink}" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 16px; color: ${emailStyles.textMuted}; font-size: 14px; line-height: 1.6;">
                      This link will expire in <strong style="color: ${emailStyles.textDark};">${expiresInHours} hours</strong>. If you didn't create an account, you can safely ignore this email.
                    </p>

                    <div style="border-top: 1px solid ${emailStyles.borderColor}; margin: 24px 0 0; padding: 24px 0 0;">
                      <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                        If the button doesn't work, copy and paste this link:
                      </p>
                      <p style="margin: 0; word-break: break-all;">
                        <a href="${verifyLink}" style="color: ${emailStyles.primaryColor}; font-size: 13px; text-decoration: none;">${verifyLink}</a>
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 12px;">
                Australian owned and operated
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
Verify Your OzVPS Email Address

Thanks for signing up for OzVPS! Please verify your email address by clicking the link below:

${verifyLink}

This link will expire in ${expiresInHours} hours.

If you didn't create an account, you can safely ignore this email.

---
© ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
      `.trim(),
    });

    if (error) {
      log(`Failed to send email verification email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Email verification email sent to ${to}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending email verification email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send SSH credentials email for newly provisioned server
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
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Your server ${serverName} is ready`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Server is Ready</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">

                <!-- Success Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: ${emailStyles.successColor};">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Server Deployed Successfully</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Your <strong style="color: ${emailStyles.textDark};">${osName}</strong> server is now online and ready to use.
                    </p>

                    <!-- Server Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px; color: ${emailStyles.textLight}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Server Name</p>
                                <p style="margin: 0; color: ${emailStyles.textDark}; font-size: 16px; font-weight: 600;">${serverName}</p>
                              </td>
                              <td align="right" valign="middle">
                                <span style="display: inline-block; background-color: #dcfce7; color: ${emailStyles.successColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">Online</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Credentials Section -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${emailStyles.borderColor}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; background-color: ${emailStyles.bgLight}; border-bottom: 1px solid ${emailStyles.borderColor};">
                          <p style="margin: 0; color: ${emailStyles.textDark}; font-size: 14px; font-weight: 600;">SSH Login Credentials</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">IP Address</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: ${emailStyles.bgLight}; padding: 4px 8px; border-radius: 4px;">${serverIp}</code>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Username</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: ${emailStyles.bgLight}; padding: 4px 8px; border-radius: 4px;">${username}</code>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px;">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Password</span>
                              </td>
                              <td style="padding: 14px 20px; text-align: right;">
                                <code style="color: ${emailStyles.warningColor}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #fef3c7; padding: 4px 8px; border-radius: 4px;">${password}</code>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Quick Connect -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quick Connect</p>
                          <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">ssh ${username}@${serverIp}</code>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid ${emailStyles.warningColor}; background-color: #fffbeb; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; color: ${emailStyles.warningColor}; font-size: 13px; font-weight: 600;">Security Recommendation</p>
                          <p style="margin: 0; color: ${emailStyles.textMuted}; font-size: 13px; line-height: 1.5;">
                            Change your password after first login and consider setting up SSH key authentication.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/dashboard" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            View Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textMuted}; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: ${emailStyles.primaryColor}; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 12px;">
                Australian owned and operated
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
YOUR SERVER IS READY
====================

Your ${osName} server is now online and ready to use.

Server: ${serverName}
Status: Online

SSH LOGIN CREDENTIALS
---------------------
IP Address: ${serverIp}
Username:   ${username}
Password:   ${password}

QUICK CONNECT
-------------
ssh ${username}@${serverIp}

SECURITY RECOMMENDATION
Change your password after first login and consider setting up SSH key authentication.

View your dashboard: ${appUrl}/dashboard

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned and operated.
      `.trim(),
    });

    if (error) {
      log(`Failed to send server credentials email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Server credentials email sent to ${to} for server ${serverName}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server credentials email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send SSH credentials email for reinstalled server
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
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  const appUrl = process.env.APP_URL || 'https://app.ozvps.com.au';
  const logoUrl = getLogoUrl();

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Your server ${serverName} has been reinstalled`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Server Reinstalled</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">

                <!-- Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: ${emailStyles.primaryColor};">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Server Reinstalled</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Your server has been reinstalled with <strong style="color: ${emailStyles.textDark};">${osName}</strong>. Your new credentials are below.
                    </p>

                    <!-- Server Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px; color: ${emailStyles.textLight}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Server Name</p>
                                <p style="margin: 0; color: ${emailStyles.textDark}; font-size: 16px; font-weight: 600;">${serverName}</p>
                              </td>
                              <td align="right" valign="middle">
                                <span style="display: inline-block; background-color: #dbeafe; color: ${emailStyles.primaryColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">Reinstalled</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Credentials Section -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${emailStyles.borderColor}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; background-color: ${emailStyles.bgLight}; border-bottom: 1px solid ${emailStyles.borderColor};">
                          <p style="margin: 0; color: ${emailStyles.textDark}; font-size: 14px; font-weight: 600;">New SSH Credentials</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">IP Address</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: ${emailStyles.bgLight}; padding: 4px 8px; border-radius: 4px;">${serverIp}</code>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Username</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: ${emailStyles.bgLight}; padding: 4px 8px; border-radius: 4px;">${username}</code>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px;">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Password</span>
                              </td>
                              <td style="padding: 14px 20px; text-align: right;">
                                <code style="color: ${emailStyles.warningColor}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #fef3c7; padding: 4px 8px; border-radius: 4px;">${password}</code>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Quick Connect -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quick Connect</p>
                          <code style="color: ${emailStyles.textDark}; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">ssh ${username}@${serverIp}</code>
                        </td>
                      </tr>
                    </table>

                    <!-- Important Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid ${emailStyles.warningColor}; background-color: #fffbeb; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; color: ${emailStyles.warningColor}; font-size: 13px; font-weight: 600;">Important</p>
                          <p style="margin: 0; color: ${emailStyles.textMuted}; font-size: 13px; line-height: 1.5;">
                            Your previous data has been erased. These are your new login credentials - save them securely.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/dashboard" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            View Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textMuted}; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: ${emailStyles.primaryColor}; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 12px;">
                Australian owned and operated
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
SERVER REINSTALLED
==================

Your server has been reinstalled with ${osName}. Your new credentials are below.

Server: ${serverName}
Status: Reinstalled

NEW SSH CREDENTIALS
-------------------
IP Address: ${serverIp}
Username:   ${username}
Password:   ${password}

QUICK CONNECT
-------------
ssh ${username}@${serverIp}

IMPORTANT
Your previous data has been erased. These are your new login credentials - save them securely.

View your dashboard: ${appUrl}/dashboard

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned and operated.
      `.trim(),
    });

    if (error) {
      log(`Failed to send server reinstall email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Server reinstall email sent to ${to} for server ${serverName}, messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server reinstall email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send a password changed confirmation email
 */
export async function sendPasswordChangedEmail(to: string): Promise<EmailResult> {
  if (!resend) {
    log('Email service not configured - cannot send password changed email', 'email');
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  const logoUrl = getLogoUrl();

  try {
    const { data, error} = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: 'Your OzVPS Password Has Been Changed',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Password Changed</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">
                <tr>
                  <td style="padding: 40px; text-align: center;">

                    <!-- Success Icon -->
                    <div style="display: inline-block; width: 56px; height: 56px; background-color: #dcfce7; border-radius: 50%; line-height: 56px; margin-bottom: 20px;">
                      <span style="color: ${emailStyles.successColor}; font-size: 24px;">&#10003;</span>
                    </div>

                    <h1 style="margin: 0 0 16px; color: ${emailStyles.textDark}; font-size: 22px; font-weight: 600;">Password Changed</h1>

                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Your OzVPS account password has been successfully updated.
                    </p>

                    <!-- Security Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid ${emailStyles.warningColor}; background-color: #fffbeb; border-radius: 0 6px 6px 0; text-align: left;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; color: ${emailStyles.warningColor}; font-size: 13px; font-weight: 600;">Security Notice</p>
                          <p style="margin: 0; color: ${emailStyles.textMuted}; font-size: 13px; line-height: 1.5;">
                            If you did not make this change, please contact our support team immediately at <a href="mailto:support@ozvps.com.au" style="color: ${emailStyles.primaryColor}; text-decoration: none;">support@ozvps.com.au</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 12px;">
                Australian owned and operated
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
Password Changed

Your OzVPS account password has been successfully updated.

SECURITY NOTICE
If you did not make this change, please contact our support team immediately at support@ozvps.com.au

---
© ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
      `.trim(),
    });

    if (error) {
      log(`Failed to send password changed email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Password changed email sent to ${to}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending password changed email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send billing reminder email (1 day before due)
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

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Payment due tomorrow for ${serverName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Payment Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">
                <tr>
                  <td style="padding: 40px;">
                    <h1 style="margin: 0 0 16px; color: ${emailStyles.textDark}; font-size: 24px; font-weight: 600;">Payment Reminder</h1>

                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Your server <strong style="color: ${emailStyles.textDark};">${serverName}</strong> is due for renewal tomorrow.
                    </p>

                    <!-- Payment Details Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${emailStyles.borderColor}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Amount Due</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <strong style="color: ${emailStyles.textDark}; font-size: 16px;">${amountDollars}</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Due Date</span>
                              </td>
                              <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                                <span style="color: ${emailStyles.textDark}; font-size: 14px;">${dueDate}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 14px 20px;">
                                <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Wallet Balance</span>
                              </td>
                              <td style="padding: 14px 20px; text-align: right;">
                                <span style="color: ${emailStyles.textDark}; font-size: 14px;">${walletBalance}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 14px; line-height: 1.6;">
                      Please ensure your wallet has sufficient funds to avoid service interruption.
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            Top Up Wallet
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
PAYMENT REMINDER

Your server ${serverName} is due for renewal tomorrow.

Amount Due: ${amountDollars}
Due Date: ${dueDate}
Wallet Balance: ${walletBalance}

Please ensure your wallet has sufficient funds to avoid service interruption.

Top up your wallet: ${appUrl}/billing

---
© ${new Date().getFullYear()} OzVPS Pty Ltd.
      `.trim(),
    });

    if (error) {
      log(`Failed to send billing reminder email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Billing reminder email sent to ${to} for server ${serverName}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending billing reminder email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send payment failed email with suspension warning
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
  const dangerColor = '#dc2626';

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Action required: Payment failed for ${serverName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Payment Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">

                <!-- Warning Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: ${dangerColor};">
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Payment Failed</h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      We were unable to process payment for your server <strong style="color: ${emailStyles.textDark};">${serverName}</strong> due to insufficient wallet balance.
                    </p>

                    <!-- Suspension Warning -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid ${dangerColor}; background-color: #fef2f2; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; color: ${dangerColor}; font-size: 14px; font-weight: 600;">Server will be suspended in ${daysUntilSuspension} days</p>
                          <p style="margin: 0; color: ${emailStyles.textMuted}; font-size: 13px; line-height: 1.5;">
                            Suspension date: <strong>${suspendDate}</strong>. Top up your wallet before this date to keep your server running.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Payment Details -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${emailStyles.borderColor}; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor};">
                          <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Server</span>
                        </td>
                        <td style="padding: 14px 20px; border-bottom: 1px solid ${emailStyles.borderColor}; text-align: right;">
                          <span style="color: ${emailStyles.textDark}; font-size: 14px;">${serverName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 14px 20px;">
                          <span style="color: ${emailStyles.textMuted}; font-size: 13px;">Amount Due</span>
                        </td>
                        <td style="padding: 14px 20px; text-align: right;">
                          <strong style="color: ${dangerColor}; font-size: 16px;">${amountDollars}</strong>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 28px; background-color: ${dangerColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            Top Up Now
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textMuted}; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: ${emailStyles.primaryColor}; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
PAYMENT FAILED

We were unable to process payment for your server ${serverName} due to insufficient wallet balance.

WARNING: Server will be suspended in ${daysUntilSuspension} days
Suspension date: ${suspendDate}

Amount Due: ${amountDollars}

Top up your wallet before this date to keep your server running.

Top up now: ${appUrl}/billing

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd.
      `.trim(),
    });

    if (error) {
      log(`Failed to send payment failed email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Payment failed email sent to ${to} for server ${serverName}`, 'email');
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
  const dangerColor = '#dc2626';

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Server suspended: ${serverName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Server Suspended</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">

                <!-- Suspended Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: #374151;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Server Suspended</h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0 0 24px; color: ${emailStyles.textMuted}; font-size: 15px; line-height: 1.6;">
                      Your server <strong style="color: ${emailStyles.textDark};">${serverName}</strong> has been suspended due to non-payment.
                    </p>

                    <!-- Status Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; border-radius: 6px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px; color: ${emailStyles.textLight}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Server Status</p>
                                <p style="margin: 0; color: ${emailStyles.textDark}; font-size: 16px; font-weight: 600;">${serverName}</p>
                              </td>
                              <td align="right" valign="middle">
                                <span style="display: inline-block; background-color: #fecaca; color: ${dangerColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">Suspended</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Reactivation Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid ${emailStyles.successColor}; background-color: #f0fdf4; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; color: ${emailStyles.successColor}; font-size: 14px; font-weight: 600;">How to reactivate</p>
                          <p style="margin: 0; color: ${emailStyles.textMuted}; font-size: 13px; line-height: 1.5;">
                            Top up your wallet with at least <strong>${amountDollars}</strong> and your server will be automatically reactivated within 10 minutes.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 28px; background-color: ${emailStyles.successColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                            Reactivate Server
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${emailStyles.textMuted}; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: ${emailStyles.primaryColor}; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0; color: ${emailStyles.textLight}; font-size: 13px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
SERVER SUSPENDED

Your server ${serverName} has been suspended due to non-payment.

HOW TO REACTIVATE
Top up your wallet with at least ${amountDollars} and your server will be automatically reactivated within 10 minutes.

Reactivate now: ${appUrl}/billing

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd.
      `.trim(),
    });

    if (error) {
      log(`Failed to send server suspended email to ${to}: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Server suspended email sent to ${to} for server ${serverName}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending server suspended email to ${to}: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}

/**
 * Send admin notification email for new support tickets
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

  // Get admin notification email from environment variable
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

  // Priority badge color mapping
  const priorityColors: Record<string, { bg: string; text: string }> = {
    low: { bg: '#6b7280', text: '#ffffff' },
    normal: { bg: '#3b82f6', text: '#ffffff' },
    high: { bg: '#f59e0b', text: '#000000' },
    urgent: { bg: '#ef4444', text: '#ffffff' },
  };
  const priorityStyle = priorityColors[priority] || priorityColors.normal;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: adminEmailList,
      subject: `[${priority.toUpperCase()}] New Support Ticket #${ticketId}: ${title}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>New Support Ticket</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${emailStyles.fontFamily}; background-color: ${emailStyles.bgLight}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">

          <!-- Logo on dark background -->
          <tr>
            <td style="padding: 24px 32px; background-color: #1f2937; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="140" height="auto" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 0 0 8px 8px; border: 1px solid ${emailStyles.borderColor}; border-top: none;">
                <tr>
                  <td style="padding: 32px;">
                    <!-- Header -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: ${emailStyles.textDark};">
                            New Support Ticket
                          </h1>
                          <p style="margin: 0 0 24px 0; font-size: 14px; color: ${emailStyles.textMuted};">
                            A new support ticket has been submitted
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Ticket Info -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgLight}; border-radius: 8px; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 20px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding-bottom: 16px;">
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: ${emailStyles.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">Ticket</p>
                                <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${emailStyles.textDark};">#${ticketId}: ${title}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom: 16px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td width="50%" style="vertical-align: top;">
                                      <p style="margin: 0 0 4px 0; font-size: 12px; color: ${emailStyles.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">Category</p>
                                      <p style="margin: 0; font-size: 14px; color: ${emailStyles.textDark};">${category}</p>
                                    </td>
                                    <td width="50%" style="vertical-align: top;">
                                      <p style="margin: 0 0 4px 0; font-size: 12px; color: ${emailStyles.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">Priority</p>
                                      <span style="display: inline-block; padding: 2px 10px; font-size: 12px; font-weight: 600; background-color: ${priorityStyle.bg}; color: ${priorityStyle.text}; border-radius: 4px; text-transform: uppercase;">${priority}</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: ${emailStyles.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">From</p>
                                <p style="margin: 0; font-size: 14px; color: ${emailStyles.textDark};">${userName || 'User'} &lt;${userEmail}&gt;</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Description -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td>
                          <p style="margin: 0 0 8px 0; font-size: 12px; color: ${emailStyles.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
                          <div style="padding: 16px; background-color: ${emailStyles.bgLight}; border-radius: 8px; border-left: 3px solid ${emailStyles.primaryColor};">
                            <p style="margin: 0; font-size: 14px; color: ${emailStyles.textDark}; line-height: 1.6; white-space: pre-wrap;">${description}</p>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Action Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${adminUrl}/tickets"
                             style="display: inline-block; padding: 14px 32px; background-color: ${emailStyles.primaryColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            View Ticket in Admin Panel
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: ${emailStyles.textLight};">
                This is an automated notification from OzVPS Support System
              </p>
              <p style="margin: 0; font-size: 12px; color: ${emailStyles.textLight};">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
NEW SUPPORT TICKET

Ticket #${ticketId}: ${title}
Category: ${category}
Priority: ${priority}
From: ${userName || 'User'} <${userEmail}>

Message:
${description}

---
View ticket: ${adminUrl}/tickets

This is an automated notification from OzVPS Support System.
© ${new Date().getFullYear()} OzVPS Pty Ltd.
      `.trim(),
    });

    if (error) {
      log(`Failed to send admin ticket notification: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`Admin ticket notification sent for ticket #${ticketId} to ${adminEmailList.join(', ')}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`Error sending admin ticket notification: ${err.message}`, 'email');
    return { success: false, error: err.message };
  }
}
