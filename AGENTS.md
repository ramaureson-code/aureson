# Project guidance

## Architecture

This is a Next.js App Router application using React, TypeScript and Tailwind CSS. Netlify services replace the originally requested Supabase/Vercel stack with the owner's explicit approval. All persistent relational state belongs in Netlify PostgreSQL through `@netlify/database` and Drizzle. Files belong in Netlify Blobs. Do not introduce local JSON or browser storage as the source of truth for carts, products, orders or enquiries.

- `app/layout.tsx`: site metadata, shared shell and organization structured data.
- `app/page.tsx`, `components/home.tsx`: branded landing page.
- `app/[...path]/page.tsx`: public and staff page routing and route metadata.
- `app/api/[...path]/route.ts`: API routing, validation, authorization entry points, cart, enquiries, uploads, quotations and customer access.
- `lib/server.ts`: server-only Identity helpers, permissions, rate limits, catalogue and cart queries.
- `lib/admin.ts`: resource CRUD, safe archival conventions, transactional inventory updates, audit records and reports.
- `lib/payments.ts`: server-calculated checkout, locked stock reservations, Razorpay order creation, signatures, verified capture, refunds and safe unpaid cancellation.
- `lib/payment-security.ts`: pure timing-safe HMAC validation.
- `lib/resources.ts`: shared admin form definitions and permission groups. The backend uses these to whitelist fields; do not add writable payment status fields.
- `db/schema.ts`: authoritative PostgreSQL schema. Generate a migration for every schema change.
- `netlify/database/migrations`: generated schema migrations plus a separate source-backed seed migration.
- `components/commerce.tsx`, `auth.tsx`, `information.tsx`, `admin.tsx`: customer/staff workflows.
- `app/globals.css`: responsive grey/milk/red visual system. The logo is an untouched original; use proportional sizing.
- `public/img`: original supplied photos/logo. Serve apparel images through Netlify Image CDN.
- `docs`: source provenance, setup and unexecuted acceptance checklist.

## Invariants

Never fabricate stock, product options, prices, reviews, shipping rates, policies or business claims. Eight Polo colour slots are deliberately disabled and unnamed until verified. Product publication requires complete verified details and at least one enabled priced variant. Existing order items are snapshots; never rebuild historical orders from current product data.

Use integer paise for monetary values. Retail line totals are exact unit price × quantity; custom invoice line totals store the exact approved amount independently of rounded per-piece display. Checkout uses server prices and locks rows. Capture callbacks/webhooks never deduct stock twice. Paid/refunded status can only follow trusted Razorpay reads; never expose a manual paid toggle. Late captures after reservation release enter review if stock is unavailable.

Use `@netlify/identity`. Authorize every private API server-side. Trust only provider-controlled roles and private admin-member records, never user metadata. The first administrator is invited by the owner in Netlify Identity. There is no public admin registration. No supplied shared credentials belong in source, fixtures, logs or docs.

Public and private file stores are separate. Sniff file contents, enforce size limits, re-encode images, and require ownership or an order-management role for private artwork downloads. PDFs are private attachment downloads only. No SVG uploads.

Store editable business/content/settings values in PostgreSQL, but keep all credentials in private deployment configuration. Public config responses must never include secrets. Notifications remain unconfigured until an actual delivery adapter is connected and tested; do not change an outbox row to sent without verified delivery.

## Working conventions

Use reusable form fields, explicit empty/error/success states, accessible labels and visible focus. CSS follows the supplied grey glass reference with restrained red accents. Never generate new product colours by recolouring reference images.

Use server-only imports for all database, storage and merchant code. Dynamic resource-boundary rows use `any` because tables are chosen from a fixed whitelist; keep normal business entities inferred from Drizzle. All database values are parameterized. Stock adjustments, order transitions and admin writes require audit/history records.

During this Netlify run, do not execute local build/start/test/type-check commands. Review edited sources and leave runtime validation to the platform. The listed tests are unexecuted until a validation environment runs them. Do not claim production readiness from source review alone.
