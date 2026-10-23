# Owner setup and deployment

## Deployment and PostgreSQL

Deploy this repository to its linked Netlify project. The build command is `npm run build` and publish directory is `.next`; Netlify's Next.js adapter provides App Router/API support. This application intentionally depends on Netlify services and is not a standalone Vercel/Supabase deployment.

Netlify provisions PostgreSQL on first connection and applies the checked-in migrations before publishing. Drizzle's schema is `db/schema.ts`; generated migrations are in `netlify/database/migrations`. The initial seed contains only verified business copy, original image references, one draft Polo, eight unnamed/disabled colour slots and disabled checkout settings. Never apply schema SQL manually to the managed database.

All database access is server-side; there is no public database API, browser database client, service-role credential or Supabase RLS setup. Authorization is enforced at every private route. Preview database branches isolate relational changes; uploaded Blobs use site-level stores, so use test artwork and avoid uploading production customer files in previews.

## Identity and first staff access

Identity activation is included with this project. In the Netlify project's Identity area:

1. Invite the business owner's real administrator email.
2. Accept the email invitation at the site and set a new, unique password of at least 12 characters.
3. In the Netlify Identity user details, assign the server-controlled `admin` role. This is treated as Super Admin by the application.
4. Sign in at `/admin` using the invited email, not a shared username.
5. For additional staff, invite them through Identity and have them accept/sign in once. This creates their profile. Copy their Identity user ID into **Staff permissions** and assign `product_manager`, `order_manager`, `staff` or `super_admin`. Use `disabled` to remove application staff access. User-controlled profile metadata cannot grant privileges.

No initial shared password is stored, printed or seeded. Invitation acceptance requires setting a fresh password and there is no public admin registration. Customer registration follows Identity's registration setting. Keep email confirmation enabled; use invitation-only registration if the owner does not want public accounts. The app supports email confirmation, invitation acceptance, recovery links, password changes and logout. Identity handles password hashing and provider-side authentication security; the app additionally rate-limits its login preflight and write endpoints in PostgreSQL.

Configure and verify Identity confirmation/recovery email delivery and site URLs before inviting production customers. Set email links to the correct HTTPS domain. Callback tokens are handled on `/login` and never logged by application code.

## Complete the Polo

In the staff workspace:

1. Edit the existing draft Polo's name, description, verified fabric, GSM and specifications. Select its category and main image.
2. Open **Colours**. Match each of the eight unnamed slots to the approved catalogue, set the verified name and hexadecimal display swatch, attach its matching original photo if available, and enable it. Do not infer official colour names from photos.
3. In **Variants & stock**, add one record per confirmed colour/size combination. Select the product and colour. Set size, unique SKU, price in integer paise, actual available stock, measured shipping weight and enabled state. Provide a reason for every stock change. Create new variants instead of reassigning old ones to different combinations.
4. Use **Product gallery** to edit/add accessible photographs. Public image uploads accept PNG/JPEG/WebP up to 5 MB and are validated and re-encoded.
5. Publish only after confirming all supplied details. Publishing checks for the description, main image, fabric, GSM, enabled named/swatches and an enabled priced variant. The eight slots can be edited, disabled or expanded later without code changes.
6. Archive discontinued products; disable variants; deactivate categories. Historical orders keep snapshots and remain readable.

## Store content, rates and policies

**Store & content** contains normal editable fields grouped into `business`, `content`, `policies` and `store` records. Edit announcement visibility/text, hero copy/image, bulk section copy, about text, contacts, Instagram and policy text. Additional homepage promotions belong in **Banners**, with image, CTA, enabled state and display order. Uploaded images return local URLs that can also be used as hero image values.

Confirm full privacy, terms, shipping and refund policies before enabling sales. The initial policy copy reflects only supplied information and explicitly flags missing legal/process details.

- Currency is INR only.
- Tax is configured as integer basis points on the garment subtotal, excluding shipping. Confirm that this basis fits the business; `0` is only appropriate if confirmed. An unset value blocks checkout.
- Shipping supports explicit state rules, with `*` as the fallback for India, charged per order or per started kilogram. Confirm and activate actual rules; per-kilogram calculations require measured weights for every variant. No rate was inferred from the ambiguous questionnaire answer.
- The minimum bulk quantity can be raised from 30; it cannot be lowered below the supplied business minimum.
- Low-stock threshold is configurable and used by the overview.
- Enable `policiesApproved` only after business review. Enable `checkoutEnabled` only after sandbox acceptance testing.

## Razorpay

Create/approve the merchant account under the owner's control. Configure **test** credentials privately in Netlify using the variable names shown in `.env.example`. Never paste credential values into content settings, source or chat.

Set up this HTTPS webhook:

```
https://YOUR-DOMAIN/api/payments/webhook
```

Subscribe to `payment.captured`, `payment.failed` and `refund.processed`. Configure the webhook signing secret privately and enable automatic payment capture in Razorpay. Use matching test-mode settings throughout testing.

The server calculates totals, locks inventory, stores one order for a checkout key and creates the gateway order. The customer reviews the shipping/tax/total breakdown before opening Razorpay. A signed browser response is verified and the payment is fetched server-side; only a captured, matching INR payment updates the order. Signed webhooks repeat the trusted gateway fetch and are idempotent. Secrets are never sent to the browser; Razorpay's publishable checkout identifier is supplied only to its checkout integration.

Unpaid orders reserve stock until an authorized staff member cancels the reservation. After at least 30 minutes, use **Cancel unpaid reservation** in the order editor. The server checks for captured/authorized gateway payments before releasing stock. Late captures recheck inventory and enter `payment_review` if fulfilment cannot be supported; staff cannot turn such an order into normal fulfilment through a status toggle. Reconcile through the merchant account, including a verified refund if needed. Do not cancel unsettled authorized payments.

Refunds are initiated in the owner's Razorpay dashboard. Verified refund events update refunded amounts and net paid-sales reporting. Stock is adjusted separately, with an inventory reason, only after any actual goods are inspected. There is no manual “mark paid” control.

After tests pass, the merchant owner can replace test configuration with approved live configuration and verify the live webhook. Do not mix live and test transactions.

## Bulk quotations and artwork

Bulk enquiries save requirements and a private artwork reference. Image/PDF artwork is capped at 5 MB; images are sniffed/re-encoded, SVG is rejected and PDFs are served as authenticated attachments. Staff with order permission can download artwork through enquiry details. General public URLs cannot retrieve private uploads.

The staff team reviews the enquiry, confirms the sample/preview and full commercial terms through WhatsApp as requested, records that communication, and creates a quotation invoice. An invoice amount is the **amount payable on acceptance**, not an assumed full-contract amount. For the supplied 50% advance process, issue the agreed advance invoice first and record the full quotation/approval terms in its description. Issue a separate quotation invoice against the same enquiry for the balance. Each accepted invoice becomes its own traceable order/payment record; no automatic split-payment or remaining-balance scheduler is claimed.

The customer must sign in with the verified email used in the enquiry to view/accept sent quotations. Accepted quotations are immutable. Orders remain pending payment until trusted Razorpay verification. Staff progress the resulting production/fulfilment records through normal order management.

**Bulk pricing** supports owner-approved base, fabric, GSM, printing and embroidery charges per piece, plus fixed charges. Enable only real approved rules. An estimate requires one base rule, validates minimum quantities and selected IDs server-side, and excludes unconfirmed tax/shipping. Final invoices always use the administrator's approved quotation amount.

## Notifications and external links

Order, payment, contact and bulk events are stored in the notification outbox as `unconfigured`. No automatic customer email, WhatsApp Business message or SMS is sent by these events. To add delivery, select the owner's provider, implement a server-only worker with retries/idempotency/delivery tracking, configure its private credentials, and test it before enabling the setting. Identity's own authentication emails are a separate provider-managed function that must also be tested.

Direct WhatsApp links open an optional customer conversation; they are not an automatic WhatsApp Business integration. Instagram uses the verified handle. No IndiaMART URL was supplied, so none was invented.

## Domain and backups

Attach the owner's domain in Netlify, configure DNS and automatic HTTPS, and update metadata base/canonical URLs, sitemap/robots URLs, structured-data URL and Identity email redirects when the domain changes. The owner controls merchant, hosting, DNS and communication-provider accounts.

Confirm managed PostgreSQL backup/retention availability in the owner's plan. Arrange regular encrypted database exports and private artwork backups under owner-controlled access; rehearse restoring to a separate site before production use. Application CSV exports support current operational records, not a full database backup. See `SECURITY.md` for retention, reconciliation and recovery procedures.
