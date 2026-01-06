/**
 * Auth0 Event Streams - User Deletion Webhook Setup
 * 
 * This webhook is triggered when a user is deleted from Auth0 via Event Streams.
 * It automatically cleans up the corresponding VirtFusion user and their servers.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. In Auth0 Dashboard, go to: Monitoring > Event Streams
 * 2. Click "Create Event Stream" > "Webhook"
 * 3. Configure:
 *    - Stream Name: OzVPS User Deletion
 *    - Endpoint: https://your-panel.com/api/hooks/auth0-user-deleted
 *    - Authentication method: Bearer
 *    - Authorization Token: (generate a secure random token, e.g., openssl rand -hex 32)
 * 
 * 4. Under "Select Events", expand "User" section and check:
 *    - user.deleted
 * 
 * 5. Save the Event Stream
 * 
 * 6. In your OzVPS panel, add the Authorization Token as:
 *    Secret Name: AUTH0_WEBHOOK_SECRET
 *    Value: (the same token you entered in Auth0)
 * 
 * HOW IT WORKS:
 * 
 * When a user is deleted from Auth0:
 * 1. Auth0 sends a webhook with the user's data (including app_metadata)
 * 2. The webhook verifies the Bearer token
 * 3. It deletes any active sessions for that user
 * 4. If app_metadata contains virtfusion_user_id:
 *    - Lists all VirtFusion servers owned by that user
 *    - Deletes each server
 *    - Deletes the VirtFusion user account
 * 
 * PAYLOAD FORMAT (Auth0 Event Streams):
 * 
 * {
 *   "id": "evt_abc123",
 *   "type": "user.deleted",
 *   "source": "urn:auth0:your-tenant:users",
 *   "specversion": "1.0",
 *   "time": "2025-01-06T12:00:00.000Z",
 *   "data": {
 *     "object": {
 *       "user_id": "auth0|abc123",
 *       "email": "user@example.com",
 *       "name": "John Doe",
 *       "app_metadata": {
 *         "virtfusion_user_id": 12345
 *       }
 *     }
 *   }
 * }
 * 
 * TESTING:
 * 
 * You can test the webhook with curl:
 * 
 * curl -X POST https://your-panel.com/api/hooks/auth0-user-deleted \
 *   -H "Authorization: Bearer YOUR_TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "type": "user.deleted",
 *     "data": {
 *       "object": {
 *         "user_id": "auth0|test123",
 *         "email": "test@example.com",
 *         "app_metadata": {
 *           "virtfusion_user_id": null
 *         }
 *       }
 *     }
 *   }'
 * 
 * Expected response: 204 No Content (success)
 */
