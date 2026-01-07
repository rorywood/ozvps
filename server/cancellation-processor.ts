import { dbStorage } from "./storage";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

const PROCESSING_INTERVAL_MS = 60 * 1000; // Check every minute

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
          
          const deleted = await virtfusionClient.deleteServer(serverIdNum);
          
          if (deleted) {
            await dbStorage.completeCancellation(cancellation.id);
            log(`Successfully deleted server ${cancellation.virtfusionServerId} and marked cancellation complete`, 'cancellation');
            processed++;
          } else {
            await dbStorage.markCancellationFailed(cancellation.id, 'VirtFusion deletion returned false');
            log(`Failed to delete server ${cancellation.virtfusionServerId}: VirtFusion returned false`, 'cancellation');
            errors++;
          }
        } catch (error: any) {
          const errorMessage = error.message || 'Unknown error';
          await dbStorage.markCancellationFailed(cancellation.id, errorMessage);
          log(`Error deleting server ${cancellation.virtfusionServerId}: ${errorMessage}`, 'cancellation');
          errors++;
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
  
  runProcessor();
}

export function stopCancellationProcessor(): void {
  isRunning = false;
  log('Stopping cancellation processor', 'cancellation');
}
