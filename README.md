# Bluefin Tuna LLC website + secure project portal

Static GitHub Pages website for https://bluefintuna.life/, with a separate Cloudflare Worker API in the same repository. Existing Cloudflare resources are reused; no automatic infrastructure creation or deployment occurs.

## Local work

Use Node 24.19.0 and npm 10.8.2. Worker dependencies are pinned in `cloudflare/worker/package-lock.json`.

```sh
npm ci --prefix cloudflare/worker
npm run build
npm test
npm run typecheck
npm run test:worker
npm run preview
```

Edit `src/*.mjs`, `src/portal-client.ts`, CSS and catalog/configuration. The build bundles the shared authoritative pricing module into a client preview and generates static HTML. The server always recalculates price. Static output is committed for the existing GitHub Pages source. Original privacy/company source remains under `src/legacy`. Never commit customer files, credentials, local state or tokens.

New payment/upload UI is disabled by default (`API_ORIGIN=''`; API development mode and approval flags false). Historical static Stripe links are preserved as configuration history but are not rendered as checkout buttons on this branch. The live site is not changed by preparing this PR.

See [HANDOFF.md](HANDOFF.md) for owner actions and live blockers, [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for evidence, and [Worker README](cloudflare/worker/README.md) for routes, schema, security limits and local testing. Preserve CNAME, Apple Privacy/Contact/Support URLs and the approved brand assets. Legal additions are drafts requiring review.
