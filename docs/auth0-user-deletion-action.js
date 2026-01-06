/**
 * Auth0 Post User Deletion Action
 * 
 * This action fires when a user is deleted from Auth0 and notifies the OzVPS panel
 * to clean up the corresponding VirtFusion user and their servers.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. In Auth0 Dashboard, go to: Actions > Library > Build Custom
 * 2. Name: "OzVPS User Deletion Sync"
 * 3. Trigger: "Post User Registration" (Note: Auth0 doesn't have a direct "Post User Deletion" 
 *    trigger in Actions, so you'll need to use Log Streams or a custom solution - see notes below)
 * 4. Paste this code
 * 5. Add Secret: OZVPS_WEBHOOK_SECRET (same value as AUTH0_WEBHOOK_SECRET in OzVPS panel)
 * 6. Add Secret: OZVPS_PANEL_URL (your panel URL, e.g., https://your-panel.com)
 * 7. Deploy the action
 * 
 * IMPORTANT: Auth0 Actions doesn't have a native "Post User Deletion" trigger.
 * For user deletion sync, you have two options:
 * 
 * OPTION A: Use Auth0 Log Streams (Recommended)
 * 1. Go to Monitoring > Streams > Create Stream
 * 2. Choose "Custom Webhook"
 * 3. Set Webhook URL to: https://your-panel.com/api/hooks/auth0-user-deleted
 * 4. Filter for event types: "sdu" (successful user deletion)
 * 5. Add authorization header if needed
 * 
 * OPTION B: Use this code with a Management API Extension/Hook
 * - Create a custom extension that calls this when users are deleted via the Management API
 * 
 * The code below shows the webhook payload format your panel expects:
 */

const crypto = require('crypto');

exports.onExecutePostUserRegistration = async (event, api) => {
  // This is a template - actual deletion would use Log Streams
  // This code demonstrates the payload format for the OzVPS webhook
};

/**
 * For Log Streams, the OzVPS panel expects this payload format at:
 * POST /api/hooks/auth0-user-deleted
 * 
 * Headers:
 *   Content-Type: application/json
 *   X-Auth0-Signature: <HMAC-SHA256 hex signature of body using webhook secret>
 * 
 * Body:
 * {
 *   "auth0UserId": "auth0|abc123",
 *   "virtFusionUserId": 12345,  // From user's app_metadata.virtfusion_user_id
 *   "email": "user@example.com"
 * }
 * 
 * The signature is computed as:
 *   HMAC-SHA256(requestBody, webhookSecret).toString('hex')
 */

// Example function to call the OzVPS webhook (for reference/testing)
async function notifyOzVPSUserDeleted(auth0UserId, virtFusionUserId, email, webhookSecret, panelUrl) {
  const payload = JSON.stringify({
    auth0UserId,
    virtFusionUserId,
    email
  });
  
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  
  const response = await fetch(`${panelUrl}/api/hooks/auth0-user-deleted`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth0-Signature': signature
    },
    body: payload
  });
  
  return response.json();
}

/**
 * QUICK SETUP - Log Stream Configuration:
 * 
 * Since Auth0 Log Streams send raw event data, you may need a small intermediary 
 * (like a Cloudflare Worker or AWS Lambda) to:
 * 1. Receive the Auth0 log event
 * 2. Extract user_id from the event
 * 3. Look up app_metadata.virtfusion_user_id via Auth0 Management API
 * 4. Forward to OzVPS webhook with proper signature
 * 
 * Alternatively, the OzVPS panel could be enhanced to:
 * 1. Accept Auth0 log stream events directly
 * 2. Look up the VirtFusion user ID from stored session data or by querying Auth0
 */
