import { Resend } from 'resend';
import { log } from './index';

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

          <!-- Logo -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center;">
              <span style="font-size: 28px; font-weight: 700; color: ${emailStyles.primaryColor};">OzVPS</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 8px; border: 1px solid ${emailStyles.borderColor};">
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

          <!-- Logo -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center;">
              <span style="font-size: 28px; font-weight: 700; color: ${emailStyles.primaryColor};">OzVPS</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 8px; border: 1px solid ${emailStyles.borderColor};">

                <!-- Success Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: ${emailStyles.successColor}; border-radius: 8px 8px 0 0;">
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

          <!-- Logo -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center;">
              <span style="font-size: 28px; font-weight: 700; color: ${emailStyles.primaryColor};">OzVPS</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 8px; border: 1px solid ${emailStyles.borderColor};">

                <!-- Header -->
                <tr>
                  <td style="padding: 24px 40px; background-color: ${emailStyles.primaryColor}; border-radius: 8px 8px 0 0;">
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

          <!-- Logo -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center;">
              <span style="font-size: 28px; font-weight: 700; color: ${emailStyles.primaryColor};">OzVPS</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${emailStyles.bgWhite}; border-radius: 8px; border: 1px solid ${emailStyles.borderColor};">
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
