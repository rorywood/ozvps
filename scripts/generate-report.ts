import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  info: {
    Title: 'OzVPS Panel - Comprehensive Feature & Security Report',
    Author: 'OzVPS',
    Subject: 'Technical Documentation',
    CreationDate: new Date(),
  }
});

const outputPath = path.join(process.cwd(), 'OzVPS_Panel_Report.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const colors = {
  primary: '#1e3a5f',
  secondary: '#2563eb',
  accent: '#10b981',
  text: '#1f2937',
  lightGray: '#6b7280',
  border: '#e5e7eb',
};

function addHeader(text: string, level: number = 1) {
  const sizes = { 1: 24, 2: 18, 3: 14 };
  const size = sizes[level as keyof typeof sizes] || 14;
  
  if (level === 1) {
    doc.moveDown(0.5);
    doc.fillColor(colors.primary).fontSize(size).font('Helvetica-Bold').text(text);
    doc.moveDown(0.3);
    doc.strokeColor(colors.secondary).lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
  } else if (level === 2) {
    doc.moveDown(0.8);
    doc.fillColor(colors.secondary).fontSize(size).font('Helvetica-Bold').text(text);
    doc.moveDown(0.3);
  } else {
    doc.moveDown(0.5);
    doc.fillColor(colors.text).fontSize(size).font('Helvetica-Bold').text(text);
    doc.moveDown(0.2);
  }
}

function addParagraph(text: string) {
  doc.fillColor(colors.text).fontSize(11).font('Helvetica').text(text, { align: 'justify', lineGap: 2 });
  doc.moveDown(0.3);
}

function addBullet(text: string, indent: number = 0) {
  const x = 60 + (indent * 15);
  doc.fillColor(colors.text).fontSize(10).font('Helvetica');
  doc.text('•', x, doc.y, { continued: true });
  doc.text('  ' + text, { lineGap: 1 });
}

function addCodeBlock(text: string) {
  const y = doc.y;
  doc.rect(50, y, 495, 20).fill('#f3f4f6');
  doc.fillColor('#374151').fontSize(9).font('Courier').text(text, 55, y + 5);
  doc.y = y + 25;
}

function addTable(headers: string[], rows: string[][]) {
  const colWidth = 495 / headers.length;
  const startY = doc.y;
  
  doc.rect(50, startY, 495, 20).fill(colors.primary);
  doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
  headers.forEach((header, i) => {
    doc.text(header, 55 + (i * colWidth), startY + 5, { width: colWidth - 10 });
  });
  
  let y = startY + 20;
  rows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 0) {
      doc.rect(50, y, 495, 18).fill('#f9fafb');
    }
    doc.fillColor(colors.text).fontSize(9).font('Helvetica');
    row.forEach((cell, i) => {
      doc.text(cell, 55 + (i * colWidth), y + 4, { width: colWidth - 10 });
    });
    y += 18;
  });
  doc.y = y + 5;
}

function checkPageBreak(minSpace: number = 100) {
  if (doc.y > 750 - minSpace) {
    doc.addPage();
  }
}

// Title Page
doc.fillColor(colors.primary).fontSize(36).font('Helvetica-Bold')
  .text('OzVPS Panel', 50, 200, { align: 'center' });
doc.moveDown(0.5);
doc.fillColor(colors.secondary).fontSize(18).font('Helvetica')
  .text('Comprehensive Feature & Security Report', { align: 'center' });
doc.moveDown(2);
doc.fillColor(colors.lightGray).fontSize(12).font('Helvetica')
  .text('Cloud Control Panel for Virtual Private Server Management', { align: 'center' });
doc.moveDown(4);
doc.fillColor(colors.text).fontSize(11).font('Helvetica')
  .text(`Generated: ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
doc.moveDown(0.5);
doc.text('ABN: 95 663 314 047', { align: 'center' });
doc.moveDown(0.5);
doc.fillColor(colors.lightGray).fontSize(10)
  .text('Confidential Technical Documentation', { align: 'center' });

// Table of Contents
doc.addPage();
addHeader('Table of Contents', 1);
const tocItems = [
  '1. Executive Summary',
  '2. System Architecture',
  '3. Authentication & Security',
  '4. User Management',
  '5. Billing & Wallet System',
  '6. Server Management',
  '7. Admin Control Center',
  '8. Background Processors',
  '9. API Security',
  '10. Database Schema',
  '11. External Integrations',
];
tocItems.forEach(item => {
  doc.fillColor(colors.text).fontSize(12).font('Helvetica').text(item);
  doc.moveDown(0.3);
});

// Section 1: Executive Summary
doc.addPage();
addHeader('1. Executive Summary', 1);
addParagraph('OzVPS Panel is a comprehensive cloud control panel designed for managing Virtual Private Servers (VPS). Built on top of the VirtFusion API, it provides a modern, secure, and user-friendly interface for customers to deploy, manage, and monitor their servers.');
addParagraph('The platform features a prepaid wallet system integrated with Stripe for seamless payment processing, automatic billing, and invoice generation. It emphasizes security with multi-layer authentication, rate limiting, and comprehensive audit logging.');

addHeader('Key Highlights', 2);
addBullet('Modern dark-first UI with glassmorphism design');
addBullet('Auth0-based authentication with VirtFusion account linking');
addBullet('Prepaid wallet system with Stripe integration');
addBullet('Two-phase server deployment (order → setup wizard)');
addBullet('Real-time VNC console access');
addBullet('Comprehensive admin control center');
addBullet('Multi-layer security with rate limiting and CSRF protection');
addBullet('Automated billing and server lifecycle management');

// Section 2: System Architecture
doc.addPage();
addHeader('2. System Architecture', 1);

addHeader('Technology Stack', 2);
addTable(
  ['Component', 'Technology', 'Purpose'],
  [
    ['Frontend', 'React 18 + TypeScript', 'User interface'],
    ['Routing', 'Wouter', 'Client-side navigation'],
    ['State', 'TanStack React Query', 'Data fetching & caching'],
    ['Styling', 'Tailwind CSS v4', 'Glassmorphism design'],
    ['Components', 'shadcn/ui + Radix', 'Accessible UI primitives'],
    ['Build', 'Vite', 'Fast development & bundling'],
    ['Backend', 'Node.js + Express', 'REST API server'],
    ['Database', 'PostgreSQL + Drizzle ORM', 'Data persistence'],
    ['Auth', 'Auth0', 'User authentication'],
    ['Payments', 'Stripe', 'Payment processing'],
    ['VPS API', 'VirtFusion', 'Server management'],
  ]
);

checkPageBreak(200);
addHeader('Architecture Pattern', 2);
addParagraph('The application follows an API Proxy Pattern where the backend acts as a secure intermediary between the frontend and external services (VirtFusion, Auth0, Stripe). This ensures API keys and secrets are never exposed to clients.');
addBullet('Frontend communicates only with the Express backend');
addBullet('Backend proxies requests to VirtFusion with proper authentication');
addBullet('Stripe webhooks are verified with HMAC signatures');
addBullet('Auth0 tokens are validated server-side');

// Section 3: Authentication & Security
doc.addPage();
addHeader('3. Authentication & Security', 1);

addHeader('3.1 Authentication System', 2);
addParagraph('The platform uses Auth0 as the identity provider for secure user authentication. Upon login, users are automatically linked to their VirtFusion account based on email address.');
addBullet('Auth0 Resource Owner Password Grant flow');
addBullet('Automatic VirtFusion user creation for new accounts');
addBullet('VirtFusion user ID stored in Auth0 app_metadata');
addBullet('Stale VirtFusion ID detection and remediation');

checkPageBreak(150);
addHeader('3.2 Session Management', 2);
addTable(
  ['Setting', 'Value', 'Description'],
  [
    ['Session Duration', '7 days', 'Maximum session lifetime'],
    ['Idle Timeout', '15 minutes', 'Session expires after inactivity'],
    ['Cookie Name', 'ozvps_session', 'HTTP-only session cookie'],
    ['Cookie Flags', 'httpOnly, secure, sameSite=strict', 'Security flags'],
    ['Single Session', 'Enforced', 'Only one active session per user'],
  ]
);

checkPageBreak(200);
addHeader('3.3 Brute Force Protection', 2);
addParagraph('Multi-layer rate limiting protects against credential stuffing and brute force attacks:');
addTable(
  ['Protection Layer', 'Threshold', 'Lockout Duration'],
  [
    ['Per-Account', '5 failed attempts', '30 minutes'],
    ['Per-IP', '20 attempts in 5 min', '15 minutes'],
    ['Email+IP Combo', '3 attempts', '30 minutes'],
    ['Progressive Delay', 'Exponential backoff', 'Up to 10 seconds'],
  ]
);

checkPageBreak(150);
addHeader('3.4 Additional Security Measures', 2);
addBullet('CSRF Protection: Origin/Referer header validation on mutating requests');
addBullet('reCAPTCHA: Server-side verification on login and registration (configurable)');
addBullet('Helmet Middleware: Security headers including CSP, X-Frame-Options');
addBullet('Input Validation: Zod schemas for all API inputs');
addBullet('Content Filtering: Server names validated for inappropriate content');
addBullet('Log Sanitization: Sensitive data removed from logs');
addBullet('HMAC Verification: Auth0 webhooks verified with SHA-256 signatures');

// Section 4: User Management
doc.addPage();
addHeader('4. User Management', 1);

addHeader('4.1 Registration Flow', 2);
addParagraph('New user registration involves multiple coordinated steps:');
addBullet('1. Email validation and duplicate check (defense-in-depth)');
addBullet('2. reCAPTCHA verification (if enabled)');
addBullet('3. Auth0 user creation');
addBullet('4. VirtFusion user creation with unique extRelationId');
addBullet('5. Stripe customer creation (or reuse existing)');
addBullet('6. Wallet initialization with $0 balance');

checkPageBreak(150);
addHeader('4.2 Login Flow', 2);
addBullet('Rate limiting check (IP, email, combo)');
addBullet('Progressive delay enforcement');
addBullet('Auth0 credential verification');
addBullet('VirtFusion account linking/validation');
addBullet('Session creation with secure cookie');
addBullet('Failed attempt tracking on failure');

checkPageBreak(150);
addHeader('4.3 Account Linking', 2);
addParagraph('The platform maintains a link between Auth0 users and VirtFusion users:');
addBullet('VirtFusion user ID stored in Auth0 app_metadata');
addBullet('Automatic re-linking if VirtFusion user is deleted');
addBullet('Admin can manually link legacy VirtFusion accounts');
addBullet('extRelationId (snowflake ID) for unique user identification');

// Section 5: Billing & Wallet
doc.addPage();
addHeader('5. Billing & Wallet System', 1);

addHeader('5.1 Prepaid Wallet', 2);
addParagraph('Users maintain a prepaid wallet balance used for server billing:');
addTable(
  ['Feature', 'Description'],
  [
    ['Balance', 'Stored in cents for precision'],
    ['Top-up', 'Via Stripe Checkout or direct charge'],
    ['Minimum Top-up', '$5 AUD'],
    ['Maximum Top-up', '$500 AUD'],
    ['Auto Top-up', 'Configurable threshold and amount'],
  ]
);

checkPageBreak(200);
addHeader('5.2 Auto Top-up', 2);
addParagraph('Automatic wallet replenishment when balance falls below threshold:');
addBullet('Configurable threshold: $1 - $100 AUD');
addBullet('Configurable amount: $5 - $500 AUD');
addBullet('Requires saved payment method');
addBullet('Processes during hourly billing cycle');

checkPageBreak(150);
addHeader('5.3 Payment Methods', 2);
addBullet('Card storage via Stripe SetupIntents');
addBullet('Duplicate card prevention (fingerprint validation)');
addBullet('3DS authentication with fallback to Checkout');
addBullet('Multiple saved cards per account');

checkPageBreak(150);
addHeader('5.4 Invoice Generation', 2);
addParagraph('All payments generate invoices stored in Stripe:');
addBullet('Invoices created automatically on Checkout completion');
addBullet('Direct charges create and finalize invoices via API');
addBullet('PDF download links to Stripe hosted PDFs');
addBullet('Invoices persist even if app database is lost');

checkPageBreak(150);
addHeader('5.5 Wallet Freeze', 2);
addParagraph('When a Stripe customer is deleted:');
addBullet('Wallet is soft-deleted (deletedAt timestamp set)');
addBullet('Auto top-up is disabled');
addBullet('Key billing routes (payment methods, setup intents, auto top-up, checkout) return WALLET_FROZEN error');
addBullet('Background billing processor skips frozen wallets');
addBullet('Balance is preserved but inaccessible for new charges');
addBullet('Read-only operations (transaction history, invoices) remain accessible');

// Section 6: Server Management
doc.addPage();
addHeader('6. Server Management', 1);

addHeader('6.1 Two-Phase Deployment', 2);
addParagraph('Server deployment is split into two phases for better user experience:');
addBullet('Phase 1 - Order: User selects plan and location, server created without OS');
addBullet('Phase 2 - Setup: User completes setup wizard with OS and hostname selection');
addBullet('Allows immediate server provisioning with deferred configuration');

checkPageBreak(150);
addHeader('6.2 Server Operations', 2);
addTable(
  ['Operation', 'Description'],
  [
    ['Power On/Off', 'Start or stop the server'],
    ['Restart', 'Graceful server reboot'],
    ['Force Stop', 'Immediate power off'],
    ['Reinstall', 'Wipe and reinstall OS with new template'],
    ['VNC Console', 'Browser-based remote console access'],
  ]
);

checkPageBreak(200);
addHeader('6.3 Server Cancellation', 2);
addParagraph('Two deletion modes with different behaviors:');
addTable(
  ['Mode', 'Grace Period', 'Revocable', 'UI State'],
  [
    ['Grace Period', '30 days', 'Yes', 'PENDING CANCELLATION badge'],
    ['Immediate', '5 minutes', 'No', 'DELETING badge with spinner'],
  ]
);
addParagraph('Immediate deletion shows a locked "Deletion In Progress" screen preventing further actions.');

checkPageBreak(150);
addHeader('6.4 Server Billing', 2);
addBullet('Daily billing: Monthly price ÷ 30 days');
addBullet('Billed from wallet balance automatically');
addBullet('Overdue after 7 days of failed billing');
addBullet('Overdue servers scheduled for immediate deletion');
addBullet('PAYMENT OVERDUE badge displayed on affected servers');

// Section 7: Admin Control Center
doc.addPage();
addHeader('7. Admin Control Center', 1);

addHeader('7.1 Admin Access', 2);
addParagraph('Admin access is controlled via Auth0 app_metadata. Administrators have access to a comprehensive infrastructure management dashboard.');

addHeader('7.2 Infrastructure Dashboard', 2);
addParagraph('Located at /admin/infrastructure with tabbed interface:');
addTable(
  ['Tab', 'Features'],
  [
    ['Overview', 'Real-time stats: servers, hypervisors, IPs, wallets'],
    ['Servers', 'List all, power controls, suspend, transfer, delete'],
    ['Hypervisors', 'Capacity and health metrics with expandable cards'],
    ['Networking', 'IP block utilization display'],
    ['VF Users', 'VirtFusion user listing with server counts'],
    ['Audit Log', 'Action history with filtering'],
  ]
);

checkPageBreak(150);
addHeader('7.3 User Management', 2);
addBullet('Search users by email');
addBullet('View user wallet balance and transaction history');
addBullet('Adjust wallet credits (add/deduct)');
addBullet('Link VirtFusion accounts for legacy users');
addBullet('Block/unblock user accounts');

checkPageBreak(150);
addHeader('7.4 Audit Logging', 2);
addParagraph('All admin actions are logged for accountability:');
addTable(
  ['Field', 'Description'],
  [
    ['Admin Identity', 'Auth0 user ID and email'],
    ['Action', 'e.g., server.power.stop, user.credit.adjust'],
    ['Target', 'Type and ID of affected entity'],
    ['Payload', 'Request parameters'],
    ['Result', 'Response summary'],
    ['Status', 'Success, failure, or pending'],
    ['IP Address', 'Admin\'s IP address'],
    ['Reason', 'Required for destructive actions'],
  ]
);

// Section 8: Background Processors
doc.addPage();
addHeader('8. Background Processors', 1);

addHeader('8.1 Billing Processor', 2);
addParagraph('Runs every hour to manage server billing:');
addBullet('Charges servers daily (plan price ÷ 30)');
addBullet('Processes auto top-ups when balance below threshold');
addBullet('Marks servers overdue after failed billing');
addBullet('Skips frozen wallets (deleted Stripe customers)');
addBullet('Initial run 5 minutes after startup');

checkPageBreak(150);
addHeader('8.2 Cancellation Processor', 2);
addParagraph('Runs every 30 seconds to process server deletions:');
addBullet('Checks for pending cancellations past scheduled time');
addBullet('Executes VirtFusion server deletion');
addBullet('Updates server billing status');
addBullet('Logs completion or failure');

checkPageBreak(150);
addHeader('8.3 Orphan Cleanup Processor', 2);
addParagraph('Runs every hour (first run after 5 minutes) to clean up orphaned accounts:');
addBullet('Checks all active wallets against Auth0');
addBullet('For deleted Auth0 users:');
addBullet('  - Deletes VirtFusion user and servers', 1);
addBullet('  - Deletes Stripe customer', 1);
addBullet('  - Soft-deletes wallet', 1);
addBullet('  - Cancels pending deploy orders', 1);
addBullet('Rate limited (100ms delay between checks)');

// Section 9: API Security
doc.addPage();
addHeader('9. API Security', 1);

addHeader('9.1 Authentication Middleware', 2);
addBullet('Session validation on protected routes');
addBullet('Admin role checking for admin routes');
addBullet('Session expiration enforcement');
addBullet('Revoked session detection');

checkPageBreak(150);
addHeader('9.2 Input Validation', 2);
addParagraph('All API inputs validated using Zod schemas:');
addBullet('Login: email format, password presence, optional reCAPTCHA');
addBullet('Registration: email format, password strength, name, reCAPTCHA');
addBullet('Server names: length limits, content filtering');
addBullet('Hostnames: valid hostname format');
addBullet('Payment amounts: within allowed ranges');

checkPageBreak(150);
addHeader('9.3 Rate Limiting', 2);
addTable(
  ['Endpoint', 'Limit', 'Window'],
  [
    ['Login', '5 attempts', '15 minutes'],
    ['Registration', 'Per-IP tracking', '5 minutes'],
    ['API General', 'Express rate limit', 'Configurable'],
  ]
);

checkPageBreak(150);
addHeader('9.4 Webhook Security', 2);
addBullet('Stripe webhooks: Signature verification with signing secret');
addBullet('Auth0 webhooks: HMAC SHA-256 signature verification');
addBullet('Raw body parsing for signature validation');
addBullet('Event deduplication via Stripe event IDs');

// Section 10: Database Schema
doc.addPage();
addHeader('10. Database Schema', 1);

addHeader('10.1 Core Tables', 2);
addTable(
  ['Table', 'Purpose'],
  [
    ['sessions', 'User session storage'],
    ['wallets', 'User wallet balances and settings'],
    ['wallet_transactions', 'Credits, debits, and refunds'],
    ['plans', 'VPS plan configurations'],
    ['deploy_orders', 'Server provisioning requests'],
    ['server_billing', 'Server billing status tracking'],
    ['server_cancellations', 'Cancellation requests'],
    ['security_settings', 'Configurable security options'],
    ['admin_audit_logs', 'Admin action history'],
    ['user_flags', 'User blocking status'],
    ['invoices', 'Invoice metadata'],
  ]
);

checkPageBreak(150);
addHeader('10.2 Key Relationships', 2);
addBullet('Wallets linked to Auth0 users via auth0_user_id');
addBullet('Wallet transactions reference parent wallet');
addBullet('Deploy orders reference plans');
addBullet('Server billing tracks VirtFusion server IDs');

// Section 11: External Integrations
doc.addPage();
addHeader('11. External Integrations', 1);

addHeader('11.1 VirtFusion API', 2);
addParagraph('Core backend service for VPS management:');
addBullet('Server creation, deletion, and power management');
addBullet('OS template retrieval and reinstallation');
addBullet('VNC console URL generation');
addBullet('Network interface and traffic information');
addBullet('User management and linking');
addBullet('10-second request timeouts with retry handling');
addBullet('30-second TTL caching for server lists');

checkPageBreak(150);
addHeader('11.2 Auth0', 2);
addParagraph('Identity provider integration:');
addBullet('Resource Owner Password Grant for login');
addBullet('Management API for user creation and metadata');
addBullet('app_metadata storage for VirtFusion user IDs');
addBullet('Admin role detection via app_metadata');
addBullet('User deletion webhooks for cleanup');

checkPageBreak(150);
addHeader('11.3 Stripe', 2);
addParagraph('Payment processing integration:');
addBullet('Checkout Sessions for wallet top-ups');
addBullet('SetupIntents for saving payment methods');
addBullet('PaymentIntents for direct charges and auto top-up');
addBullet('Customer management with metadata linking');
addBullet('Invoice generation and PDF hosting');
addBullet('Webhook events for payment confirmation');

checkPageBreak(200);
addHeader('11.4 Known API Limitations', 2);
addParagraph('VirtFusion API has some limitations that affect features:');
addBullet('No SSH key management API');
addBullet('No user lookup by email (only by ID)');
addBullet('IP allocations derived from server primary IPs only');
addBullet('No dedicated IP list endpoints');

// Final Page - Summary
doc.addPage();
addHeader('Summary', 1);
addParagraph('OzVPS Panel provides a comprehensive, secure, and user-friendly platform for VPS management. The system emphasizes security at every layer while maintaining ease of use for both customers and administrators.');

addHeader('Security Highlights', 2);
addBullet('Multi-layer authentication with Auth0');
addBullet('Comprehensive rate limiting and brute force protection');
addBullet('CSRF protection and input validation');
addBullet('Secure session management with strict cookie flags');
addBullet('Audit logging for all admin actions');
addBullet('Webhook signature verification');

addHeader('Business Features', 2);
addBullet('Prepaid wallet with automatic billing');
addBullet('Stripe-powered payments with invoice generation');
addBullet('Two-phase server deployment for better UX');
addBullet('Flexible server cancellation (grace period or immediate)');
addBullet('Real-time VNC console access');
addBullet('Comprehensive admin control center');

doc.moveDown(2);
doc.fillColor(colors.lightGray).fontSize(10).font('Helvetica')
  .text('--- End of Report ---', { align: 'center' });
doc.moveDown(0.5);
doc.text(`Document Version: 1.0 | Generated: ${new Date().toISOString()}`, { align: 'center' });

doc.end();

stream.on('finish', () => {
  console.log(`PDF report generated: ${outputPath}`);
});
