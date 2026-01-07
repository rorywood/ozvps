import PDFDocument from 'pdfkit';
import { Invoice } from '@shared/schema';
import fs from 'fs';
import path from 'path';

const BUSINESS_DETAILS = {
  name: 'OzVPS',
  abn: '95 663 314 047',
  address: 'Australia',
  email: 'support@ozvps.com.au',
  website: 'www.ozvps.com.au',
};

export async function generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoice.invoiceNumber}`,
          Author: BUSINESS_DETAILS.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100;

      doc.fontSize(28)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text(BUSINESS_DETAILS.name, 50, 50);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text('Tax Invoice', 50, 85);

      doc.fontSize(9)
        .fillColor('#333333')
        .text(BUSINESS_DETAILS.address, 400, 50, { align: 'right' })
        .text(`ABN: ${BUSINESS_DETAILS.abn}`, { align: 'right' })
        .text(BUSINESS_DETAILS.email, { align: 'right' })
        .text(BUSINESS_DETAILS.website, { align: 'right' });

      doc.moveTo(50, 120)
        .lineTo(pageWidth + 50, 120)
        .strokeColor('#e0e0e0')
        .stroke();

      const detailsY = 140;
      const leftColX = 50;
      const rightColX = 350;

      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('Invoice Details', leftColX, detailsY);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#333333');

      const detailsStartY = detailsY + 25;
      const lineHeight = 18;

      doc.font('Helvetica-Bold')
        .text('Invoice Number:', leftColX, detailsStartY);
      doc.font('Helvetica')
        .text(invoice.invoiceNumber, leftColX + 110, detailsStartY);

      doc.font('Helvetica-Bold')
        .text('Date:', leftColX, detailsStartY + lineHeight);
      doc.font('Helvetica')
        .text(formatDate(invoice.createdAt), leftColX + 110, detailsStartY + lineHeight);

      doc.font('Helvetica-Bold')
        .text('Status:', leftColX, detailsStartY + lineHeight * 2);
      
      const statusColor = invoice.status === 'paid' ? '#22c55e' : '#f59e0b';
      doc.font('Helvetica-Bold')
        .fillColor(statusColor)
        .text(invoice.status.toUpperCase(), leftColX + 110, detailsStartY + lineHeight * 2);

      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('Bill To', rightColX, detailsY);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#333333')
        .text(invoice.customerName || 'Customer', rightColX, detailsStartY)
        .text(invoice.customerEmail, rightColX, detailsStartY + lineHeight);

      const tableY = detailsStartY + lineHeight * 4 + 20;

      doc.rect(50, tableY, pageWidth, 30)
        .fillColor('#1e3a5f')
        .fill();

      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#ffffff')
        .text('Description', 60, tableY + 10)
        .text('Amount (AUD)', 400, tableY + 10, { width: 100, align: 'right' });

      const rowY = tableY + 30;
      doc.rect(50, rowY, pageWidth, 40)
        .fillColor('#f8f9fa')
        .fill();

      doc.font('Helvetica')
        .fontSize(10)
        .fillColor('#333333')
        .text(invoice.description, 60, rowY + 12)
        .text(formatCurrency(invoice.amountCents), 400, rowY + 12, { width: 100, align: 'right' });

      const totalY = rowY + 60;
      doc.moveTo(300, totalY)
        .lineTo(pageWidth + 50, totalY)
        .strokeColor('#e0e0e0')
        .stroke();

      doc.font('Helvetica')
        .fontSize(10)
        .fillColor('#666666')
        .text('Subtotal:', 350, totalY + 15)
        .text(formatCurrency(invoice.amountCents), 400, totalY + 15, { width: 100, align: 'right' });

      doc.font('Helvetica')
        .text('GST (0%):', 350, totalY + 35)
        .text('$0.00', 400, totalY + 35, { width: 100, align: 'right' });

      doc.moveTo(300, totalY + 55)
        .lineTo(pageWidth + 50, totalY + 55)
        .strokeColor('#1e3a5f')
        .lineWidth(2)
        .stroke();

      doc.font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#1e3a5f')
        .text('Total:', 350, totalY + 65)
        .text(formatCurrency(invoice.amountCents), 400, totalY + 65, { width: 100, align: 'right' });

      const notesY = totalY + 110;
      doc.rect(50, notesY, pageWidth, 60)
        .fillColor('#f0f9ff')
        .fill();

      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1e3a5f')
        .text('Payment Information', 60, notesY + 12);

      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#333333')
        .text('This invoice has been paid via credit/debit card.', 60, notesY + 28)
        .text('Funds have been credited to your OzVPS wallet.', 60, notesY + 42);

      const footerY = doc.page.height - 80;
      doc.moveTo(50, footerY)
        .lineTo(pageWidth + 50, footerY)
        .strokeColor('#e0e0e0')
        .lineWidth(1)
        .stroke();

      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#999999')
        .text('Thank you for choosing OzVPS!', 50, footerY + 15, { align: 'center', width: pageWidth })
        .text(`Generated on ${formatDate(new Date())}`, 50, footerY + 30, { align: 'center', width: pageWidth });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export async function saveInvoicePDF(invoice: Invoice, buffer: Buffer): Promise<string> {
  const invoicesDir = path.join(process.cwd(), 'invoices');
  
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }
  
  const fileName = `${invoice.invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);
  
  fs.writeFileSync(filePath, buffer);
  
  return filePath;
}
