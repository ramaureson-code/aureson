# Aureson Apparels

A Next.js storefront and staff workspace for Aureson Apparels in Tiruppur, Tamil Nadu. The design follows the supplied grey, translucent reference and uses the original logo and supplied Polo photography. Company copy comes from the uploaded Apple Pages questionnaire.

The owner approved **Netlify PostgreSQL, Identity, Blobs and hosting** in place of Supabase and Vercel. The frontend uses **Next.js App Router, React, TypeScript and Tailwind CSS**. Backend operations use Next.js route handlers, Drizzle ORM and the Razorpay server SDK.

## Local development

Use Node 22 or later, install dependencies with `npm install`, link the project to its Netlify site, and run:

```sh
netlify dev --port 8889
```

Use Netlify's environment for Identity, PostgreSQL, image transformations and Blobs. A standalone Next.js server does not emulate those services. Configure private merchant credentials in the Netlify dashboard; `.env.example` lists placeholder names only. No Supabase credentials are needed.

## Application

- `/`: branded homepage with editable announcements, hero, featured products and banners.
- `/shop`, `/product/[slug]`: database-backed catalogue, search, filters, sorting, galleries and colour/size variants.
- `/cart`, `/checkout`: database-persisted guest and account carts, server validation, stock reservations, reviewed totals and Razorpay checkout.
- `/account`, `/tracking`, `/payment-status`: authenticated order details, stored fulfilment history, payment retries and quotation acceptance.
- `/customized-t-shirts`, `/contact`: persisted enquiries and private artwork uploads.
- `/login`, `/register`: Identity login, enabled registration, invitations and password recovery.
- `/about`, `/privacy`, `/terms`, `/shipping`, `/returns`: brand information and editable policy content.
- `/admin`: protected database-connected product, colour, variant, category, stock, order, customer, quotation, pricing, shipping, banner, content, staff-permission, reporting and audit tools.

The admin workspace supports search, date/status filtering, 200-record pages and CSV exports of the current page. Products are archived, variants disabled and categories deactivated to preserve order history. Record details include internal IDs for related operations. Customer details include related orders and bulk enquiries.

## Important initial state

The supplied Polo is seeded as a **draft** with **eight unnamed, disabled colour slots** and six original gallery photographs. No colour names, prices, sizes, fabric/GSM values or stock were invented. Confirm these details in the admin workspace before publishing. Public shopping intentionally has an empty state until a complete product is published.

Checkout starts disabled. Tax, shipping, full policies, merchant credentials and webhook setup require owner confirmation. The questionnaire's shipping wording is ambiguous and is not used as an automatic rate. Test credentials must be used until the merchant approves launch.

Identity activation is included, but no admin account or shared password is seeded. The owner must invite the first administrator using a real email and assign the server-controlled `admin` role in Netlify Identity. Invitation acceptance requires a new password. Initial shared credentials from a brief are never persisted.

Notifications are stored in a private outbox with `unconfigured` status. Automatic email/WhatsApp delivery is not implemented or claimed. The site offers direct WhatsApp links and records quotation communication separately.

See [setup](docs/SETUP.md), [verified source details](docs/SOURCE-MATERIALS.md), [security and operations](SECURITY.md), and [acceptance testing](docs/TESTING.md).

## Schema changes and checks

The schema source is `db/schema.ts`. Generate migrations with `npm run db:generate -- --name descriptive_change`. SQL migrations live in `netlify/database/migrations`; Netlify applies them during deployment. Do not run migrations manually against a linked database.

Focused signature tests are provided in `tests/payment-security.test.ts`. They can be run with `node --experimental-strip-types --test tests/payment-security.test.ts` in a permitted validation environment. This development run did **not** execute builds, local servers, unit tests or end-to-end integration tests; the platform performs build validation after the changes. Follow the acceptance checklist before enabling sales.
