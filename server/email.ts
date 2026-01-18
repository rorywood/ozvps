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
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #1e293b; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-bottom: 1px solid #334155;">
              <h1 style="margin: 0; color: #38bdf8; font-size: 24px; font-weight: 700;">OzVPS</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 20px; font-weight: 600;">Reset Your Password</h2>

              <p style="margin: 0 0 20px; color: #94a3b8; font-size: 15px; line-height: 1.6;">
                We received a request to reset the password for your OzVPS account. Click the button below to create a new password.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                This link will expire in <strong style="color: #94a3b8;">${expiresInMinutes} minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
              </p>

              <p style="margin: 20px 0 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 10px 0 0; word-break: break-all;">
                <a href="${resetLink}" style="color: #38bdf8; font-size: 12px; text-decoration: none;">${resetLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #0f172a; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                © ${new Date().getFullYear()} OzVPS. All rights reserved.
              </p>
              <p style="margin: 10px 0 0; color: #475569; font-size: 11px;">
                Powered by Australian infrastructure. Built with ❤️ in Queensland.
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
© ${new Date().getFullYear()} OzVPS. All rights reserved.
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

  // Logo hosted publicly
  const logoUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/logo-email.png`
    : 'https://dev.ozvps.com.au/logo-email.png';

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `🚀 Your server ${serverName} is ready!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Server is Ready</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0e1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0e1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="180" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, #141c2e 0%, #1a2540 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a3a5c;">

                <!-- Success Banner -->
                <tr>
                  <td style="background: linear-gradient(90deg, #10b981 0%, #059669 100%); padding: 20px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="48" valign="middle">
                          <div style="width: 40px; height: 40px; background-color: rgba(255,255,255,0.2); border-radius: 50%; text-align: center; line-height: 40px;">
                            <span style="font-size: 20px;">✓</span>
                          </div>
                        </td>
                        <td valign="middle" style="padding-left: 16px;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Server Deployed Successfully</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Server Info -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 24px; color: #94a3b8; font-size: 15px; line-height: 1.7;">
                      Great news! Your <strong style="color: #60a5fa;">${osName}</strong> server is now online and ready to use.
                    </p>

                    <!-- Server Name Card -->
                    <div style="background-color: #0d1424; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #1e3a5f;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Server Name</p>
                            <p style="margin: 0; color: #f1f5f9; font-size: 18px; font-weight: 600;">${serverName}</p>
                          </td>
                          <td align="right">
                            <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); color: #10b981; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                              ● Online
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Credentials Section -->
                    <div style="background-color: #0d1424; border-radius: 12px; overflow: hidden; border: 1px solid #1e3a5f;">
                      <div style="background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%); padding: 14px 20px;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                          🔐 SSH Login Credentials
                        </h2>
                      </div>
                      <div style="padding: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f;">
                              <span style="color: #64748b; font-size: 13px;">IP Address</span>
                            </td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f; text-align: right;">
                              <code style="color: #60a5fa; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${serverIp}</code>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f;">
                              <span style="color: #64748b; font-size: 13px;">Username</span>
                            </td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f; text-align: right;">
                              <code style="color: #f1f5f9; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${username}</code>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0;">
                              <span style="color: #64748b; font-size: 13px;">Password</span>
                            </td>
                            <td style="padding: 12px 0; text-align: right;">
                              <code style="color: #fbbf24; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${password}</code>
                            </td>
                          </tr>
                        </table>
                      </div>
                    </div>

                    <!-- Quick Connect -->
                    <div style="margin-top: 24px; background-color: #0d1424; border-radius: 12px; padding: 20px; border: 1px solid #1e3a5f;">
                      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quick Connect Command</p>
                      <div style="background-color: #000000; border-radius: 8px; padding: 14px 16px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">
                        <span style="color: #10b981;">$</span>
                        <span style="color: #f1f5f9; margin-left: 8px;">ssh ${username}@${serverIp}</span>
                      </div>
                    </div>

                    <!-- Security Notice -->
                    <div style="margin-top: 24px; background: linear-gradient(90deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%); border-left: 3px solid #fbbf24; border-radius: 0 8px 8px 0; padding: 16px 20px;">
                      <p style="margin: 0; color: #fcd34d; font-size: 13px; font-weight: 600;">⚠️ Security Recommendation</p>
                      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">
                        Change your password after first login and consider setting up SSH key authentication for enhanced security.
                      </p>
                    </div>

                    <!-- CTA Button -->
                    <div style="margin-top: 32px; text-align: center;">
                      <a href="https://dev.ozvps.com.au/dashboard" style="display: inline-block; background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                        View Server Dashboard →
                      </a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: #60a5fa; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0; color: #475569; font-size: 12px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned & operated.
              </p>
              <p style="margin: 8px 0 0; color: #374151; font-size: 11px;">
                ABN: 12 345 678 901 | Brisbane, Queensland
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
🚀 YOUR SERVER IS READY!
========================

Great news! Your ${osName} server is now online and ready to use.

SERVER: ${serverName}
STATUS: Online

SSH LOGIN CREDENTIALS
---------------------
IP Address: ${serverIp}
Username:   ${username}
Password:   ${password}

QUICK CONNECT
-------------
$ ssh ${username}@${serverIp}

⚠️ SECURITY RECOMMENDATION
Change your password after first login and consider setting up SSH key authentication.

View your server: https://dev.ozvps.com.au/dashboard

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned & operated.
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

  const logoUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/logo-email.png`
    : 'https://dev.ozvps.com.au/logo-email.png';

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `🔄 Your server ${serverName} has been reinstalled`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server Reinstalled</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0e1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0e1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 0; text-align: center;">
              <img src="${logoUrl}" alt="OzVPS" width="180" style="display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, #141c2e 0%, #1a2540 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a3a5c;">

                <!-- Reinstall Banner -->
                <tr>
                  <td style="background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%); padding: 20px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="48" valign="middle">
                          <div style="width: 40px; height: 40px; background-color: rgba(255,255,255,0.2); border-radius: 50%; text-align: center; line-height: 40px;">
                            <span style="font-size: 20px;">🔄</span>
                          </div>
                        </td>
                        <td valign="middle" style="padding-left: 16px;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Server Reinstalled</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Server Info -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 24px; color: #94a3b8; font-size: 15px; line-height: 1.7;">
                      Your server has been reinstalled with <strong style="color: #a78bfa;">${osName}</strong>. Your new credentials are below.
                    </p>

                    <!-- Server Name Card -->
                    <div style="background-color: #0d1424; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #1e3a5f;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Server Name</p>
                            <p style="margin: 0; color: #f1f5f9; font-size: 18px; font-weight: 600;">${serverName}</p>
                          </td>
                          <td align="right">
                            <div style="display: inline-block; background-color: rgba(139, 92, 246, 0.15); color: #a78bfa; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                              🔄 Reinstalled
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Credentials Section -->
                    <div style="background-color: #0d1424; border-radius: 12px; overflow: hidden; border: 1px solid #1e3a5f;">
                      <div style="background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%); padding: 14px 20px;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                          🔐 New SSH Credentials
                        </h2>
                      </div>
                      <div style="padding: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f;">
                              <span style="color: #64748b; font-size: 13px;">IP Address</span>
                            </td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f; text-align: right;">
                              <code style="color: #60a5fa; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${serverIp}</code>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f;">
                              <span style="color: #64748b; font-size: 13px;">Username</span>
                            </td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #1e3a5f; text-align: right;">
                              <code style="color: #f1f5f9; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${username}</code>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0;">
                              <span style="color: #64748b; font-size: 13px;">Password</span>
                            </td>
                            <td style="padding: 12px 0; text-align: right;">
                              <code style="color: #fbbf24; font-size: 14px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; background-color: #172033; padding: 4px 10px; border-radius: 4px;">${password}</code>
                            </td>
                          </tr>
                        </table>
                      </div>
                    </div>

                    <!-- Quick Connect -->
                    <div style="margin-top: 24px; background-color: #0d1424; border-radius: 12px; padding: 20px; border: 1px solid #1e3a5f;">
                      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quick Connect Command</p>
                      <div style="background-color: #000000; border-radius: 8px; padding: 14px 16px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">
                        <span style="color: #a78bfa;">$</span>
                        <span style="color: #f1f5f9; margin-left: 8px;">ssh ${username}@${serverIp}</span>
                      </div>
                    </div>

                    <!-- Security Notice -->
                    <div style="margin-top: 24px; background: linear-gradient(90deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%); border-left: 3px solid #fbbf24; border-radius: 0 8px 8px 0; padding: 16px 20px;">
                      <p style="margin: 0; color: #fcd34d; font-size: 13px; font-weight: 600;">⚠️ Important</p>
                      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">
                        Your previous data has been erased. These are your new login credentials - save them securely.
                      </p>
                    </div>

                    <!-- CTA Button -->
                    <div style="margin-top: 32px; text-align: center;">
                      <a href="https://dev.ozvps.com.au/dashboard" style="display: inline-block; background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                        View Server Dashboard →
                      </a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                Need help? <a href="mailto:support@ozvps.com.au" style="color: #a78bfa; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 0; color: #475569; font-size: 12px;">
                © ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned & operated.
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
🔄 SERVER REINSTALLED
=====================

Your server has been reinstalled with ${osName}. Your new credentials are below.

SERVER: ${serverName}
STATUS: Reinstalled

NEW SSH CREDENTIALS
-------------------
IP Address: ${serverIp}
Username:   ${username}
Password:   ${password}

QUICK CONNECT
-------------
$ ssh ${username}@${serverIp}

⚠️ IMPORTANT
Your previous data has been erased. These are your new login credentials - save them securely.

View your server: https://dev.ozvps.com.au/dashboard

---
Need help? Contact support@ozvps.com.au
© ${new Date().getFullYear()} OzVPS Pty Ltd. Australian owned & operated.
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
  <title>Password Changed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #1e293b; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-bottom: 1px solid #334155;">
              <h1 style="margin: 0; color: #38bdf8; font-size: 24px; font-weight: 700;">OzVPS</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <div style="display: inline-block; width: 60px; height: 60px; background-color: #10b981; border-radius: 50%; line-height: 60px; font-size: 28px;">
                  ✓
                </div>
              </div>

              <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 20px; font-weight: 600; text-align: center;">Password Successfully Changed</h2>

              <p style="margin: 0 0 20px; color: #94a3b8; font-size: 15px; line-height: 1.6; text-align: center;">
                Your OzVPS account password has been successfully updated.
              </p>

              <div style="background-color: #0f172a; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #f59e0b; font-size: 13px; line-height: 1.6;">
                  <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact our support team immediately at <a href="mailto:support@ozvps.com.au" style="color: #38bdf8;">support@ozvps.com.au</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #0f172a; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                © ${new Date().getFullYear()} OzVPS. All rights reserved.
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
Password Successfully Changed

Your OzVPS account password has been successfully updated.

⚠️ Security Notice: If you did not make this change, please contact our support team immediately at support@ozvps.com.au

---
© ${new Date().getFullYear()} OzVPS. All rights reserved.
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
