import { dbStorage } from "./storage";
import { auth0Client } from "./auth0";
import { getUncachableStripeClient } from "./stripeClient";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

let isRunning = false;

async function cleanupOrphanedUser(auth0UserId: string, stripeCustomerId: string | null, virtFusionUserId: number | null): Promise<void> {
  log(`Cleaning up orphaned user ${auth0UserId}`, 'orphan-cleanup');
  
  // 1. Delete VirtFusion user and their servers
  if (virtFusionUserId) {
    try {
      const result = await virtfusionClient.cleanupUserAndServers(virtFusionUserId);
      if (result.success) {
        log(`Deleted VirtFusion user ${virtFusionUserId} and ${result.serversDeleted} servers`, 'orphan-cleanup');
      } else {
        log(`VirtFusion cleanup had errors: ${result.errors.join(', ')}`, 'orphan-cleanup');
      }
    } catch (error: any) {
      log(`Failed to cleanup VirtFusion user ${virtFusionUserId}: ${error.message}`, 'orphan-cleanup');
    }
  }
  
  // 2. Delete Stripe customer if exists
  if (stripeCustomerId) {
    try {
      const stripe = await getUncachableStripeClient();
      await stripe.customers.del(stripeCustomerId);
      log(`Deleted Stripe customer ${stripeCustomerId}`, 'orphan-cleanup');
    } catch (error: any) {
      if (error.code === 'resource_missing') {
        log(`Stripe customer ${stripeCustomerId} already deleted`, 'orphan-cleanup');
      } else {
        log(`Failed to delete Stripe customer: ${error.message}`, 'orphan-cleanup');
      }
    }
  }
  
  // 3. Soft-delete wallet
  await dbStorage.softDeleteWallet(auth0UserId);
  log(`Soft-deleted wallet for ${auth0UserId}`, 'orphan-cleanup');
  
  // 4. Cancel all orders
  const cancelledOrders = await dbStorage.cancelAllUserOrders(auth0UserId);
  if (cancelledOrders > 0) {
    log(`Cancelled ${cancelledOrders} orders for ${auth0UserId}`, 'orphan-cleanup');
  }
}

export async function processOrphanedAccounts(): Promise<{ checked: number; cleaned: number; errors: number }> {
  let checked = 0;
  let cleaned = 0;
  let errors = 0;
  
  try {
    const activeWallets = await dbStorage.getActiveWallets();
    
    for (const wallet of activeWallets) {
      checked++;
      
      try {
        const userExists = await auth0Client.userExists(wallet.auth0UserId);
        
        if (!userExists) {
          log(`Found orphaned wallet for Auth0 user ${wallet.auth0UserId}`, 'orphan-cleanup');
          await cleanupOrphanedUser(wallet.auth0UserId, wallet.stripeCustomerId, wallet.virtFusionUserId);
          cleaned++;
        }
      } catch (error: any) {
        log(`Error checking user ${wallet.auth0UserId}: ${error.message}`, 'orphan-cleanup');
        errors++;
      }
      
      // Small delay between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error: any) {
    log(`Error in orphan cleanup: ${error.message}`, 'orphan-cleanup');
    errors++;
  }
  
  return { checked, cleaned, errors };
}

export function startOrphanCleanupProcessor(): void {
  if (isRunning) {
    log('Orphan cleanup processor already running', 'orphan-cleanup');
    return;
  }
  
  isRunning = true;
  log('Starting orphan cleanup processor (checking every hour)', 'orphan-cleanup');
  
  // Run initial cleanup after 5 minutes (give time for app to stabilize)
  setTimeout(async () => {
    try {
      const result = await processOrphanedAccounts();
      if (result.cleaned > 0) {
        log(`Orphan cleanup completed: ${result.checked} checked, ${result.cleaned} cleaned, ${result.errors} errors`, 'orphan-cleanup');
      }
    } catch (error: any) {
      log(`Orphan cleanup error: ${error.message}`, 'orphan-cleanup');
    }
  }, 5 * 60 * 1000);
  
  // Schedule regular cleanup
  setInterval(async () => {
    try {
      const result = await processOrphanedAccounts();
      if (result.cleaned > 0) {
        log(`Orphan cleanup completed: ${result.checked} checked, ${result.cleaned} cleaned, ${result.errors} errors`, 'orphan-cleanup');
      }
    } catch (error: any) {
      log(`Orphan cleanup error: ${error.message}`, 'orphan-cleanup');
    }
  }, CLEANUP_INTERVAL_MS);
}
