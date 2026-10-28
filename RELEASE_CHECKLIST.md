# Release evidence — 2026-10-28

Status: **local code validation complete; production blocked pending owner setup and explicit approval**. No remote migration, Worker deployment, Cron configuration, DNS change, live payment, secret installation or main merge was performed. Existing Worker/D1/R2 were not recreated.

## Automated checks

| Check | Observed result |
|---|---|
| Node / npm | 24.19.0 / 10.8.2 |
| Clean lockfile install | `npm ci --prefix cloudflare/worker --ignore-scripts`: 50 packages; success |
| Dependency audit | `npm audit --prefix cloudflare/worker --audit-level=low`: 0 vulnerabilities at execution time |
| Worker + browser TypeScript | `npm run typecheck`: pass |
| Source format | `npm run format:check --prefix cloudflare/worker`: pass |
| Worker tests | `npm run test:worker`: 20 passed, 0 failed, 0 skipped; real local Miniflare D1/R2; fake clock, fake Stripe/Turnstile/Telegram |
| Static build | 20 canonical pages, 2 aliases, 404; client esbuild bundle succeeds |
| Static regressions | `npm test`: 1084 assertions across 23 pages pass |
| Worker bundle | esbuild ESM bundle succeeds |
| Local D1 migration | `npm run migrate:local`: 0001 applied, 16 commands; no remote migration |
| Real local Wrangler | `/health` 200, development/enabled false; POST orders 503 portal_not_enabled; test-scheduled endpoint 200 Ran scheduled event |
| Protected source/asset bytes | CNAME, original privacy/company source, legacy company logo, manifest unchanged against baseline; hashes in docs/portal-baseline.json |
| Deployment configuration | Exact existing D1 UUID and R2 names; no resource creation commands; empty cron array; development/disabled/legal false |

The Worker suite exercises seven base prices, blocks/caps/material rules, tampered input, missing approvals, origin isolation, hashed capability isolation, missing/forged admin credentials, real signed RS256 JWT audience/issuer/expiry/allowlist, allowed/forbidden upload formats, actual oversize with absent Content-Length, concurrent byte and count reservations, expiry during upload, exact simulated 12-hour boundary, delayed cleanup, deletion retry/orphan recovery, missing documents, quote/consent, frozen checkout, Stripe signature/time/environment/session/currency/amount, duplicate webhooks, async-pending not paid, late payment, notification lease/optional disabling, rate limit, scheduled dispatch, paid-only admin download and free re-upload.

No assertion above represents a real Stripe card transaction, real Access deployment, real Turnstile challenge or 12 hours of wall-clock staging observation. Those remain release gates. Miniflare runs with local resources only.

## Browser/manual checks

- Local portal at 320, 375, 768, 1024, 1440 CSS px: document width equals viewport width; one H1; disabled create button in preview mode; screenshots under docs/screenshots/portal/.
- Basic with resources, 76 activities and concrete: browser preview **$1,223.00** (799 +175 +249).
- Update material selection: operator-verification notice; creation disabled for review scope.
- RTL fixture at 375px: no horizontal overflow. This validates layout foundation, not translated language correctness.
- Tab from package selector reaches activities; visible solid focus outline. Native labels/controls, 44px control minimums, headings, disabled status and reduced-motion CSS inspected. This is a targeted manual accessibility check, not a full WCAG certification or screen-reader audit.
- Browser error log: none during final preview interactions. No backend configured; therefore no real upload/checkout/browser Access E2E claimed.
- Optimized new portal JS 22,823 bytes / gzip 7,059; CSS 3,202 / gzip 1,148; portal HTML 10,669 / gzip 4,074. Machine-readable sizes in docs/portal-asset-sizes.json. This is an asset budget check, **not** a Lighthouse score or field performance measurement.
- Existing live Apple-facing URLs checked read-only: privacy.html, company.html, /support, /support/, /support.html HTTP 200; homepage 200 with id=contact. App Store Connect private app settings unverified.
- Existing Worker /health returned HTTP 403; current remote implementation/bindings unverified.

## Pending release gates

- [ ] Owner authorizes separately the remote test deployment/migration against existing resources.
- [ ] Cloudflare account/bindings/private bucket inspected; Worker 403 diagnosed.
- [ ] Remote Access positive/negative authentication, same-site API/login/cookie/CORS/OPTIONS behavior in desktop and iOS Safari.
- [ ] Real Turnstile, Stripe test Checkout and signed retry events; customer cancellation/expired checkout/network retry and receipt checked.
- [ ] Real staging 12-hour expiry/deletion and Cron failure recovery; approved cron and redacted monitoring.
- [ ] Load/memory/concurrency test on the actual Worker plan; operator scanning and secure processing workflow.
- [ ] Tax/invoice/legal/transaction-metadata retention/calendar approved; LEGAL_APPROVED explicitly set only afterward.
- [ ] Broken support mailbox repaired and outside sender round-trip tested; every app's App Store Connect URLs verified.
- [ ] Real-device mobile Safari, screen-reader, contrast audit and performance measurements completed.
- [ ] Optional Telegram provisioning/test/alerts, or deliberately left off.
- [ ] Explicit owner production approval. No automatic merge/deploy exists in the added check workflow.

## Deploy / rollback

Follow HANDOFF.md in sequence. Local build/test commands are in README.md. The added GitHub Actions workflow only tests PRs/this feature branch; it has read-only repository permissions and contains no deploy step. Its remote result is checked separately after PR creation.

Preserve baseline `466e0fbee90c9aa7193b1ae742cab487c718f20e`. Disable intake before rollback, retain webhook and cleanup for outstanding payments/files, revert the static PR normally, restore a known-good Worker version without deleting D1/R2. Do not force-push or reset DNS/CNAME. No data-destructive rollback migration is supplied.

## Primary implementation references

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [R2 Workers bindings](https://developers.cloudflare.com/r2/api/workers/workers-binding/)
- [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature)
