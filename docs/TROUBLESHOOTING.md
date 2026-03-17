# Troubleshooting

## App starts but login or API requests fail

- Confirm `.env` exists and the Auth0 settings are correct.
- Check both application logs and PM2 logs for startup validation failures.
- Verify the database and Redis connection strings are reachable from the server.

## Admin panel says access denied

- Check the admin IP whitelist entries.
- If you are behind nginx or Cloudflare, ensure `TRUST_PROXY=true` is set and the proxy forwards the original client IP.
- If the whitelist is empty, bootstrap mode should allow access until the first entry is created.

## Stripe billing routes fail

- Confirm `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` are set.
- Verify the wallet is not marked deleted or frozen.
- Use the Stripe status endpoint to confirm the frontend can fetch its publishable key.

## VirtFusion operations fail

- Validate `VIRTFUSION_PANEL_URL` and `VIRTFUSION_API_TOKEN`.
- Check that the user mapping exists and that the mapped VirtFusion user still exists upstream.
- For admin-triggered syncs, confirm the Auth0 user still has a valid email address.

## Rate limits seem wrong behind a proxy

- Set `TRUST_PROXY=true` only when the app is actually behind a trusted reverse proxy.
- Make sure the proxy sends `X-Forwarded-For` consistently.
- Restart the process after changing proxy settings.

## Dependency audit still reports issues

- Run `npm audit --omit=dev` to review production dependencies only.
- This repo now pins patched `express-rate-limit`, `qs`, and `minimatch` resolution paths.
- Any remaining advisories should be treated as upstream dependency exceptions and reviewed before major releases.
