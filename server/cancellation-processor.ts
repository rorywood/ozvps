import { dbStorage } from "./storage";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

const PROCESSING_INTERVAL_MS = 30 * 1000; // Check every 30 seconds for faster cleanup

let isRunning = false;

export async function processExpiredCancellations(): Promise<{ processed: number; errors: number }> {
  const now = new Date();
  let processed = 0;
  let errors = 0;
  
  try {
    const pendingCancellations = await dbStorage.getPendingCancellations();
    
    for (const cancellation of pendingCancellations) {
      const scheduledTime = new Date(cancellation.scheduledDeletionAt);
      
      if (scheduledTime <= now) {
        log(`Processing cancellation for server ${cancellation.virtfusionServerId} (mode: ${cancellation.mode})`, 'cancellation');
        
        try {
          const serverIdNum = parseInt(cancellation.virtfusionServerId, 10);
          
          if (isNaN(serverIdNum)) {
            throw new Error(`Invalid server ID: ${cancellation.virtfusionServerId}`);
          }
          
          // Call VirtFusion delete API - this triggers VirtFusion's own 5-min deletion process
          await virtfusionClient.deleteServer(serverIdNum);
          
          // Mark as completed - VirtFusion will handle the actual deletion over ~5 minutes
          await dbStorage.completeCancellation(cancellation.id);
          log(`Successfully submitted deletion for server ${cancellation.virtfusionServerId} to VirtFusion`, 'cancellation');
          processed++;
        } catch (error: any) {
          // If VirtFusion says server not found (404), it's already deleted - mark complete
          if (error.message?.includes('404')) {
            await dbStorage.completeCancellation(cancellation.id);
            log(`Server ${cancellation.virtfusionServerId} already deleted in VirtFusion, marked complete`, 'cancellation');
            processed++;
          } else {
            const errorMessage = error.message || 'Unknown error';
            await dbStorage.markCancellationFailed(cancellation.id, errorMessage);
            log(`Error deleting server ${cancellation.virtfusionServerId}: ${errorMessage}`, 'cancellation');
            errors++;
          }
        }
      }
    }
  } catch (error: any) {
    log(`Error in cancellation processor: ${error.message}`, 'cancellation');
    errors++;
  }
  
  return { processed, errors };
}

export function startCancellationProcessor(): void {
  if (isRunning) {
    log('Cancellation processor already running', 'cancellation');
    return;
  }
  
  isRunning = true;
  log('Starting cancellation processor (checking every minute)', 'cancellation');
  
  const runProcessor = async () => {
    if (!isRunning) return;
    
    try {
      const pendingCount = (await dbStorage.getPendingCancellations()).length;
      log(`Cancellation processor running: ${pendingCount} pending cancellations`, 'cancellation');
      
      const { processed, errors } = await processExpiredCancellations();
      if (processed > 0 || errors > 0) {
        log(`Cancellation processor: ${processed} processed, ${errors} errors`, 'cancellation');
      }
    } catch (error: any) {
      log(`Cancellation processor error: ${error.message}`, 'cancellation');
    }
    
    if (isRunning) {
      setTimeout(runProcessor, PROCESSING_INTERVAL_MS);
    }
  };
  
  // Run immediately on startup, then every minute
  runProcessor();
}

export function stopCancellationProcessor(): void {
  isRunning = false;
  log('Stopping cancellation processor', 'cancellation');
}
