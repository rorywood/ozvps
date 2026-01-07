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

// Cleanup VirtFusion users that don't have a corresponding Auth0 account
// This catches users that were deleted from Auth0 but never had a wallet in our system
async function cleanupOrphanedVirtFusionUsers(): Promise<{ checked: number; cleaned: number; errors: number }> {
  let checked = 0;
  let cleaned = 0;
  let errors = 0;
  
  try {
    log('Starting VirtFusion orphan scan...', 'orphan-cleanup');
    
    // Paginate through all VirtFusion users
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const result = await virtfusionClient.getAllUsers(page, 100);
      
      for (const vfUser of result.users) {
        checked++;
        
        // Skip users without extRelationId - they might be created directly in VirtFusion
        if (!vfUser.extRelationId) {
          continue;
        }
        
        // The extRelationId should be the Auth0 user ID or a unique identifier we set
        // Check if this user still exists in Auth0
        try {
          // First check if there's a wallet with this VirtFusion user ID
          const wallet = await dbStorage.getWalletByVirtFusionUserId(vfUser.id);
          
          if (wallet) {
            // User has a wallet - check via the wallet's Auth0 ID
            const userExists = await auth0Client.userExists(wallet.auth0UserId);
            if (!userExists) {
              log(`VirtFusion user ${vfUser.id} (${vfUser.email}) has orphaned wallet - cleaning up`, 'orphan-cleanup');
              await cleanupOrphanedUser(wallet.auth0UserId, wallet.stripeCustomerId, vfUser.id);
              cleaned++;
            }
          } else {
            // No wallet - check if extRelationId is a confirmed Auth0 user ID
            // Auth0 IDs follow specific patterns: provider|identifier
            // Known Auth0 providers: auth0, google-oauth2, facebook, twitter, github, linkedin, windowslive, apple, etc.
            const extId = vfUser.extRelationId;
            
            // Only process if extRelationId explicitly matches Auth0 patterns
            // This prevents false positives from other systems (WHMCS, custom integrations, etc.)
            const auth0Patterns = [
              /^auth0\|/,           // Database/username-password connections
              /^google-oauth2\|/,   // Google OAuth
              /^facebook\|/,        // Facebook
              /^twitter\|/,         // Twitter/X
              /^github\|/,          // GitHub
              /^linkedin\|/,        // LinkedIn
              /^windowslive\|/,     // Microsoft
              /^apple\|/,           // Apple
              /^email\|/,           // Email connections
              /^sms\|/,             // SMS connections
              /^samlp\|/,           // SAML
              /^waad\|/,            // Azure AD
              /^adfs\|/,            // ADFS
              /^ad\|/,              // Active Directory
              /^oauth2\|/,          // Generic OAuth2
            ];
            
            const isAuth0Id = extId && auth0Patterns.some(pattern => pattern.test(extId));
            
            if (isAuth0Id) {
              // This is confirmed as an Auth0 user ID - verify it exists
              const userExists = await auth0Client.userExists(extId);
              if (!userExists) {
                // Auth0 user confirmed deleted - safe to clean up
                log(`VirtFusion user ${vfUser.id} (${vfUser.email}) has deleted Auth0 account ${extId} - deleting`, 'orphan-cleanup');
                const result = await virtfusionClient.cleanupUserAndServers(vfUser.id);
                if (result.success) {
                  log(`Deleted orphaned VirtFusion user ${vfUser.id} and ${result.serversDeleted} servers`, 'orphan-cleanup');
                  cleaned++;
                } else {
                  log(`Failed to cleanup VirtFusion user ${vfUser.id}: ${result.errors.join(', ')}`, 'orphan-cleanup');
                  errors++;
                }
              }
            }
            // If extRelationId doesn't match known Auth0 patterns, skip - might be from WHMCS or other system
          }
        } catch (error: any) {
          log(`Error checking VirtFusion user ${vfUser.id}: ${error.message}`, 'orphan-cleanup');
          errors++;
        }
        
        // Rate limit between checks
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      // Check if there are more pages
      hasMore = page < result.lastPage;
      page++;
    }
    
    log(`VirtFusion orphan scan complete: ${checked} checked, ${cleaned} cleaned, ${errors} errors`, 'orphan-cleanup');
  } catch (error: any) {
    log(`Error in VirtFusion orphan cleanup: ${error.message}`, 'orphan-cleanup');
    errors++;
  }
  
  return { checked, cleaned, errors };
}

export async function processOrphanedAccounts(): Promise<{ checked: number; cleaned: number; errors: number }> {
  let checked = 0;
  let cleaned = 0;
  let errors = 0;
  
  // Phase 1: Check wallets (users who logged into the panel)
  try {
    log('Phase 1: Checking orphaned wallets...', 'orphan-cleanup');
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
    log(`Error in wallet orphan cleanup: ${error.message}`, 'orphan-cleanup');
    errors++;
  }
  
  // Phase 2: Check VirtFusion users directly (catches users without wallets)
  try {
    log('Phase 2: Checking VirtFusion users...', 'orphan-cleanup');
    const vfResult = await cleanupOrphanedVirtFusionUsers();
    checked += vfResult.checked;
    cleaned += vfResult.cleaned;
    errors += vfResult.errors;
  } catch (error: any) {
    log(`Error in VirtFusion orphan cleanup: ${error.message}`, 'orphan-cleanup');
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
