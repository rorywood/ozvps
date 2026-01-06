import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { dbStorage } from './storage';
import { log } from './index';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Parse the event to handle wallet top-ups
    const stripe = await getUncachableStripeClient();
    const webhookSecret = await sync.getManagedWebhookSecret();
    
    if (!webhookSecret) {
      log('Webhook secret not available, skipping custom processing', 'stripe');
      return;
    }
    
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    // Log event details for debugging
    log(`Webhook received: ${event.type} (${event.id})`, 'stripe');

    // Handle checkout.session.completed for wallet top-ups
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      log(`Checkout completed: customer=${session.customer}, amount_total=${session.amount_total}, currency=${session.currency}, payment_status=${session.payment_status}, metadata=${JSON.stringify(session.metadata)}`, 'stripe');
      
      // Validate payment was actually completed
      if (session.payment_status !== 'paid') {
        log(`Skipping non-paid checkout: payment_status=${session.payment_status}`, 'stripe');
        return;
      }
      
      // Check if this is a wallet top-up
      if (session.metadata?.type === 'wallet_topup') {
        const auth0UserId = session.metadata.auth0UserId;
        const amountCents = parseInt(session.metadata.amountCents, 10);
        const metadataCurrency = session.metadata.currency?.toLowerCase();
        
        // Validate currency matches expected (AUD)
        if (session.currency?.toLowerCase() !== 'aud') {
          log(`Currency mismatch: expected=aud, received=${session.currency}`, 'stripe');
          return;
        }
        
        // Validate metadata currency if present
        if (metadataCurrency && metadataCurrency !== 'aud') {
          log(`Metadata currency mismatch: expected=aud, received=${metadataCurrency}`, 'stripe');
          return;
        }
        
        // Validate amount matches session amount_total
        if (session.amount_total && session.amount_total !== amountCents) {
          log(`Amount mismatch: metadata=${amountCents}, session=${session.amount_total}`, 'stripe');
          // Use the session amount_total as it's the authoritative source
        }
        
        const creditAmount = session.amount_total || amountCents;
        
        if (auth0UserId && creditAmount > 0) {
          log(`Processing wallet top-up: user=${auth0UserId}, amount=${creditAmount} cents, event=${event.id}`, 'stripe');
          
          try {
            const wallet = await dbStorage.creditWallet(auth0UserId, creditAmount, {
              type: 'credit',
              stripeEventId: event.id,
              stripePaymentIntentId: session.payment_intent,
              stripeSessionId: session.id,
            });
            
            log(`Wallet credited: user=${auth0UserId}, new_balance=${wallet.balanceCents} cents`, 'stripe');
          } catch (error: any) {
            log(`Failed to credit wallet: ${error.message}`, 'stripe');
            throw error;
          }
        } else {
          log(`Invalid top-up data: auth0UserId=${auth0UserId}, creditAmount=${creditAmount}`, 'stripe');
        }
      } else {
        log(`Non-topup checkout completed: type=${session.metadata?.type}`, 'stripe');
      }
    }
  }
}
