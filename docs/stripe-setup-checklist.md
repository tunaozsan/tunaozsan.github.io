# Stripe portal setup

Current implementation/setup instructions: [HANDOFF.md](../HANDOFF.md), [Worker README](../cloudflare/worker/README.md), [release checks](../RELEASE_CHECKLIST.md).

The seven historical Payment Links remain in `data/payment-links.json` for traceability. The new portal creates exactly one server-priced Checkout Session per order, including compatible add-ons; do not concatenate seven links or enable a legacy bypass. Do not activate live keys, existing Payment Links, webhook/dashboard edits or checkout settings as part of this PR. Owner must separately reconcile/archive old links after an approved migration. No payout/bank changes are required.
