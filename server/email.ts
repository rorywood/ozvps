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
  log(`[EMAIL FUNCTION] sendServerCredentialsEmail called with: to=${to}, serverName=${serverName}, serverIp=${serverIp}, username=${username}, hasPassword=${!!password}, osName=${osName}`, 'email');

  if (!resend) {
    log('[EMAIL FUNCTION] ❌ Resend not configured - resend instance is null', 'email');
    return {
      success: false,
      error: 'Email service not configured. Please contact administrator.'
    };
  }

  log(`[EMAIL FUNCTION] ✅ Resend configured, calling resend.emails.send()`, 'email');

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `New server provisioned - here are your login credentials`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Server is Ready</title>
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

              <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 20px; font-weight: 600; text-align: center;">Your Server is Ready!</h2>

              <p style="margin: 0 0 20px; color: #94a3b8; font-size: 15px; line-height: 1.6; text-align: center;">
                Your ${osName} server <strong style="color: #f1f5f9;">${serverName}</strong> has been successfully provisioned and is now running.
              </p>

              <!-- Credentials Box -->
              <div style="background-color: #0f172a; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 16px; color: #10b981; font-size: 16px; font-weight: 600;">SSH Access Credentials</h3>

                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #64748b; font-size: 13px; padding: 8px 0;">Server IP:</td>
                    <td style="color: #f1f5f9; font-size: 13px; font-family: 'Courier New', monospace; padding: 8px 0;">${serverIp}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-size: 13px; padding: 8px 0;">Username:</td>
                    <td style="color: #f1f5f9; font-size: 13px; font-family: 'Courier New', monospace; padding: 8px 0;">${username}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-size: 13px; padding: 8px 0;">Password:</td>
                    <td style="color: #f1f5f9; font-size: 13px; font-family: 'Courier New', monospace; padding: 8px 0;">${password}</td>
                  </tr>
                </table>

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155;">
                  <p style="margin: 0; color: #64748b; font-size: 12px;">Quick Connect Command:</p>
                  <p style="margin: 8px 0 0; color: #38bdf8; font-size: 13px; font-family: 'Courier New', monospace;">
                    ssh ${username}@${serverIp}
                  </p>
                </div>
              </div>

              <!-- Security Warning -->
              <div style="background-color: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 4px; padding: 12px 16px; margin: 20px 0;">
                <p style="margin: 0; color: #fca5a5; font-size: 13px; line-height: 1.6;">
                  <strong>🔒 Security Recommendation:</strong> Change your password after first login and enable SSH key authentication.
                </p>
              </div>

              <p style="margin: 20px 0 0; color: #64748b; font-size: 13px; line-height: 1.6; text-align: center;">
                Need help getting started? Visit our <a href="https://ozvps.com.au/docs" style="color: #38bdf8; text-decoration: none;">documentation</a> or contact <a href="mailto:support@ozvps.com.au" style="color: #38bdf8; text-decoration: none;">support</a>.
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
Your Server is Ready!

Your ${osName} server "${serverName}" has been successfully provisioned and is now running.

SSH ACCESS CREDENTIALS
=======================
Server IP: ${serverIp}
Username:  ${username}
Password:  ${password}

Quick Connect Command:
ssh ${username}@${serverIp}

🔒 SECURITY RECOMMENDATION
Change your password after first login and enable SSH key authentication.

Need help? Visit https://ozvps.com.au/docs or contact support@ozvps.com.au

---
© ${new Date().getFullYear()} OzVPS. All rights reserved.
Powered by Australian infrastructure. Built with ❤️ in Queensland.
      `.trim(),
    });

    log(`[EMAIL FUNCTION] Resend API response: data=${JSON.stringify(data)}, error=${JSON.stringify(error)}`, 'email');

    if (error) {
      log(`[EMAIL FUNCTION] ❌ Resend returned error: ${error.message}`, 'email');
      return { success: false, error: error.message };
    }

    log(`[EMAIL FUNCTION] ✅ Email sent successfully! messageId: ${data?.id}`, 'email');
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    log(`[EMAIL FUNCTION] ❌ Exception caught: ${err.message}`, 'email');
    log(`[EMAIL FUNCTION] ❌ Full error: ${JSON.stringify(err)}`, 'email');
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
