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
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      (await sync.getManagedWebhookSecret()) || ''
    );

    // Handle checkout.session.completed for wallet top-ups
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      // Check if this is a wallet top-up
      if (session.metadata?.type === 'wallet_topup') {
        const auth0UserId = session.metadata.auth0UserId;
        const amountCents = parseInt(session.metadata.amountCents, 10);
        
        if (auth0UserId && amountCents > 0) {
          log(`Processing wallet top-up: ${auth0UserId} +${amountCents} cents`, 'stripe');
          
          await dbStorage.creditWallet(auth0UserId, amountCents, {
            type: 'credit',
            stripeEventId: event.id,
            stripePaymentIntentId: session.payment_intent,
            stripeSessionId: session.id,
          });
          
          log(`Wallet credited successfully for ${auth0UserId}`, 'stripe');
        }
      }
    }
  }
}
