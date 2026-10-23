# Acceptance checklist — not executed in this run

Local builds, type-checks, test runners and development servers were not run because this environment delegates validation to its deployment pipeline. Source files and generated migrations were reviewed. The signature unit tests are provided but unexecuted. Database migrations, actual Identity sessions, merchant webhooks and responsive behavior must be verified in a deployed test environment.

Use an isolated Netlify test site/database branch, test artwork, two confirmed customer accounts, and each staff role. Use Razorpay test mode only. The source Polo must remain draft until the owner supplies real catalogue values. Any temporary test prices, colours or inventory must be confined to the test site and removed before launch.

## Product and stock

- Sign in as Super Admin, create/edit a category, change its order/image and deactivate it.
- Open the seeded draft and confirm exactly eight unnamed disabled colour slots and all six original gallery photos. Configure owner-approved names, swatches and images; do not assume every photo is a different colour.
- Configure sizes, unique SKUs, prices and actual/test stock separately per colour/size. Confirm stock reason is required, inventory movements/audit actor are recorded, and negative stock is rejected.
- Check incomplete product publication is rejected; complete product publication appears in shop without code edits. Change price/image and verify the public view updates.
- Select colours and sizes, check matching image/SKU/stock/price, reject unavailable combinations, then disable a variant and archive a product. Historical orders remain unchanged.
- Search and filter catalogue by category, price, size, colour, GSM and stock; verify all sort modes and empty/error states.

## Cart and checkout

- Add, increase/decrease and remove items. Reload as a guest; verify database persistence. Log in; verify guest/account merge and stock caps.
- Attempt forged prices, invalid variant IDs, disabled colours, stale prices and quantities above current stock. The server uses current trusted prices and rejects invalid stock.
- Confirm unconfigured merchant, tax, policies or shipping block checkout. Confirm per-kilogram shipping rejects unmeasured garment weights. Confirm exact-state shipping takes precedence over fallback.
- Confirm address/PIN validation, reviewed line totals, subtotal, shipping, tax and final amount. Custom invoice line totals must equal the exact approved invoice even where per-piece division rounds.
- Submit the same checkout key concurrently; verify one order and one stock reservation. Submit two customers for the last stock unit; only the valid locked reservation proceeds.
- Trigger gateway creation failure after reservation; verify the unpaid order remains recoverable from the account without creating a duplicate stock deduction.

## Payments and refunds

- Run `node --experimental-strip-types --test tests/payment-security.test.ts` in a permitted test environment. Tests cover exact payloads, tampering, malformed lengths and raw-byte webhook verification.
- Complete a test captured payment; verify matching INR amount, one captured payment row, one confirmed order and no second stock deduction.
- Cancel or fail checkout; verify no paid status is fabricated. Retry from the customer's account and verify the original order/gateway reference is reused.
- Test an authorized-but-not-captured payment. Verification must not mark it paid.
- Submit a modified browser signature, wrong order, wrong amount/currency and unsigned/tampered webhook; reject each without paid-state changes.
- Replay a captured webhook, browser callback and concurrent duplicate event; payment, stock and notification effects must not duplicate.
- After the minimum waiting interval, cancel an unpaid reservation as staff. Reject cancellation with authorized/captured gateway payment. Verify stock is restored exactly once.
- Test a late capture after release with both sufficient and insufficient inventory; fulfil normally only with stock, otherwise enter payment review. Confirm ordinary staff status edits cannot bypass review.
- Initiate partial/full refunds in the test merchant dashboard. Verify trusted refunded amounts, idempotent replay, net paid-sales totals, and no automatic stock increment.

## Orders, accounts and roles

- Customer A cannot view Customer B's order, payment retry, quotation or private artwork by modifying identifiers.
- Verify account tracking shows order date/items, paid state, stored fulfilment history and actual shipment reference. Courier links are genuine stored HTTPS links.
- Update confirmed → processing → packed → shipped → delivered; record shipment details/internal notes and inspect audit/history. Reject unpaid fulfilment and backward status transitions.
- Invite first admin through Identity, accept with a fresh password, sign in/out, confirm password recovery and verify expired links/sessions fail safely. No public admin registration exists.
- Test anonymous requests to every private API and direct admin data request. Product Manager cannot read customer/orders/settings; Order Manager cannot change products/roles; Staff permissions follow the backend map; Super Admin can perform authorized operations. Self-permission changes are rejected.
- Verify customer profile details and related order/enquiry history. Passwords and private merchant values never appear.

## Enquiries and quotations

- Submit contact and bulk enquiries, observe success only after persisted records, and verify staff can view/update statuses/notes.
- Reject quantities below 30 or the configured higher minimum, mismatched structured size totals, invalid emails and oversized/forged uploads.
- Upload PNG/JPEG/WebP/PDF artwork; reject SVG, executable content disguised as images, oversized files and excessive decoded dimensions. Private downloads require owner/order-manager permission and PDFs download as attachments.
- Configure approved pricing rules, require exactly one base rule and respect quantity minima. Do not show a fabricated estimate when no rules exist.
- Record full commercial/sample approval terms, issue a payable quotation invoice, record communication and mark sent. The correct verified email can accept once, producing a single unpaid order. Accepted quotations cannot be edited. Follow the separate advance/balance invoice process described in setup.
- Confirm outbox rows say unconfigured; do not claim email/WhatsApp delivery. Verify direct WhatsApp and Instagram links separately.

## Content, devices and operations

- Edit business contacts/about, announcement on/off, hero image/copy, policies and banners; verify public pages change without code edits. Confirm unsupported currency/secret values are rejected.
- Check phone/tablet/laptop/desktop widths, navigation/search, swatches, quantity controls, checkout forms and admin tables. Verify no horizontal page overflow.
- Test keyboard navigation, skip link, visible focus, form errors, dialog focus containment/Escape, accessible names and reduced-motion behavior.
- Check canonical metadata, organization data, sitemap published products, robots exclusions and Image CDN responses. No fictional product review/rating/offer metadata should exist.
- Simulate database, network, image-upload and expired-session failures. Errors must not expose stack traces, raw SQL, payment credentials or customer data.
- Check paginated staff searches/date/status filters, current-page CSV exports and spreadsheet-injection protection. Confirm reports use verified payments and subtract recorded refunds.
- Confirm the owner's backup/restore plan, private-artwork retention, pending-payment reconciliation and HTTPS domain/Identity callbacks before enabling live checkout.
