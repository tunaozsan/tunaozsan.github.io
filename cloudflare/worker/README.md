# Bluefin project portal API

This directory targets **existing** Worker `bluefin-project-portal-api`, D1 `bluefin-project-db` (`DB`, UUID `c21cc680-8df5-4f81-b411-20d18b0e5f37`) and private R2 `bluefin-project-uploads` (`UPLOADS`). Do not run `create` commands. No remote resources were created or changed for this PR.

Use Node 24.19.0 (`.nvmrc`) and npm 10.8.2 (lockfile v3). Dependencies are exact-pinned, including overrides for patched Miniflare development dependencies. No automatic deploy script exists.

```sh
npm ci
npm run typecheck
npm test
npm run bundle
npm run migrate:local
npm run dev -- --local --ip 127.0.0.1 --port 8787
# separate terminal, local runtime only:
curl http://127.0.0.1:8787/health
curl 'http://127.0.0.1:8787/__scheduled?cron=*/15+*+*+*+*'
```

The checked-in API refuses customer uploads/checkouts. Set local/test settings privately only for synthetic-data tests. `.dev.vars.example` lists secret names; `.dev.vars`, `.env`, `.wrangler`, `.build` are ignored. The checked-in database UUID is not a secret. Local emulation never applies migrations remotely.

## Design and security boundaries

- `catalog.ts`: single source of truth for API and bundled client preview. Seven new stable portal SKUs map to the existing website catalog in `src/planning.mjs`. Integer cents, one base, ceil-50 blocks, exact caps, optional bounded revision/material quantities. Update materials always require human review; no automatic operator approval endpoint is offered for unverified scope.
- `index.ts`: strict request schemas, CORS, capabilities, Turnstile, rate limits, admin routes. Capability tokens contain 256 random bits, are returned once, stored only as SHA-256 digests server-side and kept in browser sessionStorage. No tokens in URLs. They are reusable order-scoped bearer credentials until expiry, not literally single-use upload tokens. Lost codes require verified operator handling. No analytics on portal pages. XSS/device compromise can expose a browser-held capability; CSP and DOM text-only rendering reduce risk.
- `security.ts`: server-verified Cloudflare Access RS256 JWT with fixed issuer, audience, expiry and operator email allowlist. Static `/admin/` is only a shell; no data authorization happens in JS. Never trust an unverified Access header. Test keys are rejected in production. Webhooks remain available when new order intake is disabled so paid events are not silently discarded.
- `storage.ts`: D1 BEFORE INSERT trigger atomically reserves 20 MiB per in-flight file (including missing Content-Length), max 100 MiB/order, 20 files. After upload, reservation shrinks to actual bytes. New orders have a global capacity ceiling of 20 unexpired workspaces; per-IP creation limit 5/10min, other requests 120/10min, and per-order limit 120/10min. Rate keys are salted hashes and expire. Review business quotas before activation.
- File input is read in bounded chunks, then buffered up to 20 MiB for R2's known-length body requirement. Missing length and actual oversize are tested. Per-read timeout 15s; overall logical limit 120s. This is a bounded-buffer MVP, not an unlimited streaming upload. Memory/load testing is a production gate.
- Only XER (`ERMHDR`), CSV (text structure), PDF (`%PDF-`) are accepted. XER MIME may be text/plain or application/octet-stream. Path traversal, binary text, active HTML and disallowed extensions are rejected. This is signature validation, **not antivirus**. PDFs can still contain active content, CSVs formulas, and XER malicious parser inputs. No browser previews; operators must open in a sandboxed/scanned workflow. ZIP/XML/Office/CAD/MPP/macros are disabled until inspection is implemented. Required drawings may be supplied as PDF; complex originals require controlled manual arrangements.
- R2 keys contain random order/file IDs only. No public URLs. File state is checked on every request. An authorized download started before expiry may finish afterward; no new retrieval can begin at or after expiry. Copying/downloading before expiry cannot be revoked.
- `payments.ts`: server-generated Stripe line items; account ID verified before session creation; immutable cart, consent version, quote hash, 15-minute quote window, no discount or shipping, explicit reviewed tax mode, configurable invoice creation (default false). Session expiry equals absolute file expiry; new checkout rejected with less than 31 minutes remaining. Card-only MVP. Stripe network failures leave the cart frozen; retry uses the same idempotency key. Manual reconciliation is needed if a quote expires during prolonged provider failure. Never create a new order and charge again without checking Stripe.
- Webhooks verify raw-body timestamped HMAC (5-minute tolerance), environment, event identity, bound session and a fresh Stripe session retrieval. Reconcile currency, quote hash, subtotal and final total including tax. Redirection/GET cannot set paid. Event dedupe/order update/outbox use a D1 transaction (`batch`). If webhook beats session binding, HTTP 409 prompts Stripe retry.
- Admin endpoints list by keyset cursor, expose private details only after auth, download only paid, unexpired files, mark retrieved and issue one re-upload child per parent. Child gets a new 12-hour session and inherits paid status; no further checkout allowed. Share the once-issued private code via an independently verified channel. User self-service endpoint only requests review. No unauthenticated recovery route exists.
- `cleanup.ts`: 100 file rows/sweep, deletion retries, bounded orphan/late-writer R2 sweep with cursor; 20 outstanding Stripe expirations/sweep; salted rate rows cleanup. Access ends at exactly 12h for new requests regardless of scheduler. Physical deletion has a queue/incident delay. Default cron array is EMPTY. After approved test deployment, operator enables `*/15 * * * *` on this Worker only.
- Filename metadata is scrubbed when a file is deleted. Minimal order/consent/payment records remain. Customer metadata currently remains in D1 pending a reviewed transaction retention schedule; no claim that all data is deleted in 12 hours.
- Telegram: optional, no PII/filenames/attachments; paid outbox created once, DB lease avoids normal concurrent duplicates, up to 8 retries with backoff. Delivery is **at least once**: a provider success followed by a DB failure can duplicate a notification; Telegram does not provide transactional exactly-once delivery. Admin DB status is authoritative. Configure monitoring for exhausted retries before go-live.

## Routes

Public: `GET /health`, `GET /api/v1/catalog`.
Customer capability: `POST /api/v1/orders`, `GET .../:id/status`, `POST/GET .../:id/files`, `DELETE .../:id/files/:fileId`, `POST .../:id/quote`, `POST .../:id/checkout`, `POST .../:id/reupload`.
Stripe: `POST /api/v1/stripe/webhook` (no CORS; signature required).
Access-protected: `GET /api/v1/admin/orders?before=<timestamp>&cursorId=<id>`, `GET .../:id`, `GET .../:id/files/:fileId`, `POST .../:id/actions` (`mark-retrieved`, `issue-reupload`).

Error responses expose a code/request ID only. Workers observability is disabled by default to avoid accidentally logging request tokens, payloads or private filenames. Add approved redacted operational metrics before production.

## Schema

`0001_init.sql` creates orders, order_files, payment_events, notifications, audit_events, rate_limits and housekeeping, with expiry/status/order/session indexes and quota reservation trigger. Migration uses IF NOT EXISTS and local tests execute the actual SQL on Miniflare D1. Do not modify a released migration: add a new numbered file.

Only after owner review/authentication: `npx wrangler whoami`, inspect the existing account bindings, approve remote migration separately, then `npx wrangler d1 migrations apply bluefin-project-db --remote`. A deliberate `npx wrangler deploy` changes the existing Worker. Neither command was run remotely. Recheck both bindings and private bucket settings after every approved deploy. See ../../HANDOFF.md for the full sequence and go-live gates.
