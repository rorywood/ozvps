import { dbStorage } from "./storage";
import { virtfusionClient } from "./virtfusion";
import { log } from "./index";

const PROCESSING_INTERVAL_MS = 30 * 1000; // Check every 30 seconds for faster cleanup

let isRunning = false;

// Phase 1: Process pending cancellations - submit deletion to VirtFusion
async function processPendingCancellations(): Promise<{ submitted: number; errors: number }> {
  const now = new Date();
  let submitted = 0;
  let errors = 0;
  
  const pendingCancellations = await dbStorage.getPendingCancellations();
  
  for (const cancellation of pendingCancellations) {
    const scheduledTime = new Date(cancellation.scheduledDeletionAt);
    
    if (scheduledTime <= now) {
      log(`Submitting deletion for server ${cancellation.virtfusionServerId} (mode: ${cancellation.mode})`, 'cancellation');
      
      try {
        const serverIdNum = parseInt(cancellation.virtfusionServerId, 10);
        
        if (isNaN(serverIdNum)) {
          throw new Error(`Invalid server ID: ${cancellation.virtfusionServerId}`);
        }
        
        // Check if server already deleted in VirtFusion
        const serverExists = await virtfusionClient.checkServerExists(serverIdNum);
        
        if (!serverExists) {
          // Server already gone from VirtFusion, mark complete immediately
          await dbStorage.completeCancellation(cancellation.id);
          log(`Server ${cancellation.virtfusionServerId} already deleted in VirtFusion, marked complete`, 'cancellation');
          submitted++;
          continue;
        }
        
        // Call VirtFusion delete API - this triggers VirtFusion's own deletion process
        await virtfusionClient.deleteServer(serverIdNum);
        
        // Mark as "processing" - VirtFusion is now deleting the server
        await dbStorage.markCancellationProcessing(cancellation.id);
        log(`Deletion submitted for server ${cancellation.virtfusionServerId}, marked as processing`, 'cancellation');
        submitted++;
      } catch (error: any) {
        // If VirtFusion says server not found (404), it's already deleted - mark complete
        if (error.message?.includes('404')) {
          await dbStorage.completeCancellation(cancellation.id);
          log(`Server ${cancellation.virtfusionServerId} already deleted in VirtFusion, marked complete`, 'cancellation');
          submitted++;
        } else {
          const errorMessage = error.message || 'Unknown error';
          await dbStorage.markCancellationFailed(cancellation.id, errorMessage);
          log(`Error deleting server ${cancellation.virtfusionServerId}: ${errorMessage}`, 'cancellation');
          errors++;
        }
      }
    }
  }
  
  return { submitted, errors };
}

// Phase 2: Check processing cancellations - confirm server is deleted from VirtFusion
async function checkProcessingCancellations(): Promise<{ completed: number; stillProcessing: number }> {
  let completed = 0;
  let stillProcessing = 0;
  
  const processingCancellations = await dbStorage.getProcessingCancellations();
  
  for (const cancellation of processingCancellations) {
    try {
      const serverIdNum = parseInt(cancellation.virtfusionServerId, 10);
      
      if (isNaN(serverIdNum)) {
        await dbStorage.completeCancellation(cancellation.id);
        completed++;
        continue;
      }
      
      // Check if server still exists in VirtFusion
      const serverExists = await virtfusionClient.checkServerExists(serverIdNum);
      
      if (!serverExists) {
        // Server is gone from VirtFusion, mark as completed
        await dbStorage.completeCancellation(cancellation.id);
        log(`Server ${cancellation.virtfusionServerId} confirmed deleted from VirtFusion`, 'cancellation');
        completed++;
      } else {
        // Server still exists, keep waiting
        stillProcessing++;
      }
    } catch (error: any) {
      // If error checking, assume still processing
      stillProcessing++;
    }
  }
  
  return { completed, stillProcessing };
}

export async function processExpiredCancellations(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  try {
    // Phase 1: Submit pending deletions to VirtFusion
    const { submitted, errors: submitErrors } = await processPendingCancellations();
    processed += submitted;
    errors += submitErrors;
    
    // Phase 2: Check if processing deletions are complete
    const { completed, stillProcessing } = await checkProcessingCancellations();
    processed += completed;
    
    if (stillProcessing > 0) {
      log(`${stillProcessing} servers still being deleted by VirtFusion`, 'cancellation');
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
      const processingCount = (await dbStorage.getProcessingCancellations()).length;
      if (pendingCount > 0 || processingCount > 0) {
        log(`Cancellation processor: ${pendingCount} pending, ${processingCount} processing`, 'cancellation');
      }
      
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
