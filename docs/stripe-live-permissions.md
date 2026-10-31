# Stripe Live restricted key — Bluefin portal

Current application API calls and the owner-authorized Checkout/webhook/legacy-link transition define the following permissions. Use Live mode and a restricted `rk_live_` key stored only as production Worker Secret `STRIPE_SECRET_KEY`.

| Resource | Permission | Purpose |
|---|---|---|
| Checkout Sessions | Write | Create/retrieve Checkout and expire only explicitly eligible sessions |
| Customers | Write | Billing/customer setup for Checkout and invoices |
| Webhook Endpoints | Write | Inspect/configure the production endpoint and events |
| Payment Links | Write | Inventory and authorized controlled retirement of the seven existing links |
| Account / account information | Read | Verify the actual merchant |
| Products, Prices | Read | Discover and validate existing Live catalog; no catalog mutations in this step |
| Payment Intents, Charges | Read | Verify payment/refund state; no direct charge or refund creation |
| Invoices, Events | Read | Invoice and payment reconciliation evidence |
| Tax Settings, Tax Registrations | Read | Inspect existing tax configuration; no registrations or tax elections |
| Payouts, Transfers, External/Bank Accounts, Refunds, Connect and remaining resources | None | Outside the integration's required access |

Apply permissions to the merchant's own account. Connected-account permission columns remain None. Write includes Read. Payment Links Write can be reduced to Read after the controlled migration is complete; no such permission reduction has been performed yet.

A publishable `pk_` key cannot replace a server API key. Webhook signing secret `STRIPE_WEBHOOK_SECRET` is separate and belongs to the production endpoint. Never paste either secret into chat, logs or Git. Existing values are not printed by readiness diagnostics.

The runtime currently rejects the installed value as a publishable key. A successful API call with the corrected restricted key is still required to confirm exact permissions. Account/catalog/tax/webhook verification is NOT RUN until that succeeds. Creating missing catalog entries, if actually necessary and within the existing owner-approved scope, requires Product/Price Write access separately; no missing Live IDs are fabricated.

Official references: [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys), [Key types](https://docs.stripe.com/keys).
