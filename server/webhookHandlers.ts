import { getStripeSync } from './stripeClient';
import { dbStorage } from './storage';
import { log } from './index';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    log(`Webhook incoming: payload size=${payload.length} bytes`, 'stripe');
    
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    // SECURITY: Signature verification is REQUIRED
    // stripe-replit-sync verifies the webhook signature internally
    // If verification fails, we MUST NOT process the event
    try {
      await sync.processWebhook(payload, signature);
      log('stripe-replit-sync: signature verified and event processed', 'stripe');
    } catch (syncError: any) {
      // Signature verification failed - this could be a forged/tampered payload
      log(`SECURITY: Webhook signature verification failed: ${syncError.message}`, 'stripe');
      throw new Error('Webhook signature verification failed');
    }

    // Parse the event - only reached if signature verification succeeded
    let event;
    try {
      event = JSON.parse(payload.toString('utf8'));
    } catch (parseError: any) {
      log(`Failed to parse webhook payload: ${parseError.message}`, 'stripe');
      return;
    }

    log(`Webhook received: ${event.type} (${event.id}) livemode=${event.livemode}`, 'stripe');

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
        const sessionCustomerId = session.customer;
        
        // SECURITY: Verify the Stripe customer matches the wallet
        // This prevents crediting the wrong account if metadata was somehow manipulated
        const wallet = await dbStorage.getWallet(auth0UserId);
        if (!wallet) {
          log(`SECURITY: No wallet found for auth0UserId=${auth0UserId}`, 'stripe');
          return;
        }
        
        if (!wallet.stripeCustomerId) {
          log(`SECURITY: Wallet has no Stripe customer ID linked for user=${auth0UserId}`, 'stripe');
          return;
        }
        
        if (wallet.stripeCustomerId !== sessionCustomerId) {
          log(`SECURITY: Customer ID mismatch! wallet.stripeCustomerId=${wallet.stripeCustomerId}, session.customer=${sessionCustomerId}. Rejecting credit.`, 'stripe');
          return;
        }
        
        log(`Customer verification passed: ${sessionCustomerId} matches wallet`, 'stripe');
        
        // Validate currency matches expected (AUD)
        if (session.currency?.toLowerCase() !== 'aud') {
          log(`Currency mismatch: expected=aud, received=${session.currency}`, 'stripe');
          return;
        }
        
        // Use session.amount_total as the authoritative source (from Stripe, not metadata)
        const creditAmount = session.amount_total;
        
        if (!creditAmount || creditAmount <= 0) {
          log(`Invalid credit amount: ${creditAmount}`, 'stripe');
          return;
        }
        
        // Validate amount is within acceptable range (500-50000 cents = $5-$500)
        if (creditAmount < 500 || creditAmount > 50000) {
          log(`SECURITY: Amount outside valid range: ${creditAmount} cents`, 'stripe');
          return;
        }
        
        log(`Processing wallet top-up: user=${auth0UserId}, amount=${creditAmount} cents, event=${event.id}`, 'stripe');
        
        try {
          const updatedWallet = await dbStorage.creditWallet(auth0UserId, creditAmount, {
            type: 'credit',
            stripeEventId: event.id,
            stripePaymentIntentId: session.payment_intent,
            stripeSessionId: session.id,
          });
          
          log(`Wallet credited: user=${auth0UserId}, new_balance=${updatedWallet.balanceCents} cents`, 'stripe');
        } catch (error: any) {
          log(`Failed to credit wallet: ${error.message}`, 'stripe');
          throw error;
        }
      } else {
        log(`Non-topup checkout completed: type=${session.metadata?.type}`, 'stripe');
      }
    }
  }
}
