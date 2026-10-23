# Security and operating notes

All credentials belong in private deployment configuration. `.env.example` contains placeholders only. No shared initial administrator password was persisted. Rotate any credentials that were previously shared elsewhere before production.

## Application boundaries

- Identity verifies authentication; private API routes enforce server-side roles. Only server-controlled Identity roles and private `admin_members` records grant staff permission. Public signup never grants a staff role.
- PostgreSQL and Blobs are accessed only in server modules/API handlers. Public catalogue/content endpoints return public data. Customer orders are selected by authenticated owner ID; quotation access requires the verified enquiry email. Tracking displays stored statuses, not simulated courier movement.
- All browser mutations require a matching Origin. Public writes and login preflight use a persistent PostgreSQL rate limiter; use Netlify Identity's provider-side abuse controls for the underlying login endpoint and confirm their production settings. Login preflight alone does not replace provider controls.
- Guest cart ownership uses a random HttpOnly, SameSite=Lax cookie, secure on production HTTPS. Guest records are merged into the account cart on login. Product availability is revalidated at checkout.
- Checkout ignores browser prices. Cart/variant/order row locks, unique checkout keys, unique gateway payment IDs, captured-payment verification and webhook event IDs protect against duplicate reservations and paid-state changes.
- Cancelled reservations are released only by staff after the minimum delay and gateway checks. Late captures are reconciled separately. Review pending orders regularly so abandoned reservations do not indefinitely suppress available stock.
- Public images and private artwork use separate Blobs stores. File signatures/size are checked. Images are decoded, bounded and re-encoded with metadata removed. SVG is rejected; private PDFs download as attachments. Never add a public wildcard storage listing route.
- User text is rendered as text, not arbitrary HTML. CSV exports guard common spreadsheet formula prefixes. API errors omit stack traces and database/merchant details.
- Historical order lines and fulfilment/audit records survive product archival. Paid/refunded state has no writable admin field. Refund webhooks fetch authoritative merchant state.

## Operational requirements

Review `payment_review`, failed payments, abandoned reservations and notification-outbox records. Refunds must occur in Razorpay, with verified webhooks updating the database. Never force a paid status with a direct SQL edit. Use inventory adjustments with recorded reasons after actual returns or corrections.

Define an owner-approved retention schedule for customer contacts, private artwork, audit logs and authentication records. Expired rate-limit rows may be removed through a controlled maintenance task after their expiry. Do not expose backup files or customer exports in `public/` or commit them. Restrict staff exports to the purposes of fulfilment/support.

Back up PostgreSQL and private artwork using owner-controlled, encrypted storage and access controls. Confirm the actual managed-database recovery features of the hosting plan; no backup service or recovery schedule is automatically configured by this repository. Test restore/reconciliation on an isolated site. Restore related payment, order, inventory and audit data consistently and reconcile gateway state before reopening checkout.

Preview database branches are isolated by the platform; site-level Blobs are shared across deploys. Do not use real customer uploads in previews. Use a separate test site for integration testing with production-like data.

The code has been source-reviewed in this run. Authentication, payment, webhook, upload, role and concurrency behavior requires the acceptance tests in `docs/TESTING.md` with the configured services before production approval. No penetration test or formal compliance certification is claimed.
