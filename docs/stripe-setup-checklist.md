# Stripe configuration handoff

Prepared 28 October 2026. This is an operational checklist, not a record of completed Stripe Dashboard changes. No Stripe account, bank information, API secret, live checkout or invoice configuration was accessed or changed for this implementation.

## Current site behavior

All seven entries in `data/payment-links.json` are `null`. Each card opens an editable email addressed to `support@bluefintuna.life`, identifying its exact SKU and price. No customer is sent to an invented checkout or asked to enter card data on the website. Each CTA has service terms, refund and privacy links alongside it.

Keep the old combined multi-package checkout deactivated and excluded from the website. Each core SKU needs its own verified, single-product, one-time link. No material add-on should silently change a core checkout.

| SKU | USD | Activities | Business days | Link status |
| --- | ---: | ---: | ---: | --- |
| AUDIT-150 | 199 | 150 | 5 | Not supplied / not verified |
| BASE-BASIC-NR-75 | 499 | 75 | 5 | Not supplied / not verified |
| BASE-BASIC-R-75 | 799 | 75 | 7 | Not supplied / not verified |
| BASE-DETAIL-NR-200 | 999 | 200 | 10 | Not supplied / not verified |
| BASE-DETAIL-R-200 | 1499 | 200 | 12 | Not supplied / not verified |
| UPDATE-NR-200 | 399 | 200 | 4 | Not supplied / not verified |
| UPDATE-R-200 | 649 | 200 | 5 | Not supplied / not verified |

These values mirror `data/services.json`, the website's canonical catalog. All turnaround periods begin after complete inputs are accepted and scope is confirmed. Updates cover one reporting period and must never use a recurring price.

## Owner configuration and verification

- [ ] Approve commercial terms, refunds, revision arrangements and tax treatment before enabling checkout. Basic resource category caps (10 labor / 5 cost) and Detailed caps (20 labor / 10 cost) remain proposed; public pages correctly leave them to the written quotation.
- [ ] Create or inspect seven independent Payment Links. Confirm legal business name, one matching SKU, exact USD base price, fixed quantity one, one-time billing and no unrelated line items. Payment Links use a Stripe-hosted payment page. See [Stripe Payment Links](https://docs.stripe.com/payment-links).
- [ ] Configure customer name, optional business name and billing address only. Use an optional project reference if useful; avoid required phone, shipping information and sensitive custom fields. Set live service terms and privacy URLs in Public details, then require terms agreement on each link. Configure refund/support information in Checkout settings. See [Payment Link customization](https://docs.stripe.com/payment-links/customize).
- [ ] Verify `https://bluefintuna.life/service-terms.html`, `https://bluefintuna.life/refund-policy.html` and the unchanged `https://bluefintuna.life/privacy.html` return useful, approved content before activating those settings.
- [ ] Keep Managed Payments off for the human-delivered consulting catalog specified in the brief. Have an appropriate adviser confirm taxes and whether Stripe Tax should be enabled; a disabled tax toggle does not establish that no tax is due. No tax setting was changed by this project.
- [ ] Verify receipt branding and `support@bluefintuna.life`. Enable automatic successful-payment emails and paid invoice generation for each one-time link where supported. Review invoice fees and local invoice requirements; do not promise that a generic PDF meets every jurisdiction's rules. See [Stripe receipts and paid invoices](https://docs.stripe.com/receipts) and [post-payment invoice pricing](https://support.stripe.com/questions/pricing-for-post-payment-invoices-for-one-time-purchases-via-checkout-and-payment-links).
- [ ] Add a short SKU-specific confirmation using the drafts below. Stripe provides confirmation-message or redirect options under After the payment; receipts and the payment confirmation are distinct. See [After a Payment Link payment](https://docs.stripe.com/payment-links/post-payment).
- [ ] Test the full flow in a Stripe sandbox: correct line item and total, taxes if configured, policy links, terms checkbox, support details, confirmation and invoice/receipt. Do not run real charges from scripts.
- [ ] Supply the seven exact active `https://buy.stripe.com/...` URLs. Independently inspect each URL against the table, confirm live/test mode and record reviewer/date before replacing its `null` value. This is an administrative verification step; hostname validation in the build is not evidence that a product or amount is correct.
- [ ] Run the site build and smoke checks, then inspect each rendered button. Only verified links should say “Continue to Stripe.” Unconfigured services must retain “Request this service.”

Adaptive Pricing may offer a local-currency checkout. Keep the website's USD base catalog clear; do not hardcode exchange rates or use local display currency to misstate the base price.

## Draft confirmation messages

Review Dashboard character limits and use plain text. These are SKU-specific draft instructions, not a claim that settings have been saved. Customers should request transfer instructions first; no upload endpoint is configured.

**AUDIT-150**

Thank you. Email support@bluefintuna.life with AUDIT-150 to arrange transfer of your XER, scope and milestone requirements. Up to 150 activities; PDF findings only, no corrections. Delivery: 5 business days after complete inputs are accepted and scope is confirmed.

**BASE-BASIC-NR-75**

Thank you. Email support@bluefintuna.life with BASE-BASIC-NR-75 for transfer instructions. Prepare your BOQ/work list, quantities, units, dates and constraints. No MH/cost data needed. Up to 75 activities; XER + PDF; 1 in-scope revision. 5 business days after accepted inputs and scope.

**BASE-BASIC-R-75**

Thank you. Email support@bluefintuna.life with BASE-BASIC-R-75 for transfer instructions. Prepare scope/BOQ, dates, approved labor MH budgets, cost allocations and relevant rates. Materials excluded. Up to 75 activities; XER + PDF; 1 in-scope revision. 7 business days after accepted inputs and scope.

**BASE-DETAIL-NR-200**

Thank you. Email support@bluefintuna.life with BASE-DETAIL-NR-200 for transfer instructions. Prepare detailed scope/BOQ, quantities, units, milestones, drawings and constraints. No MH/cost data needed. Up to 200 activities; XER + PDF + Excel and narrative; 2 revisions. 10 business days after accepted inputs and scope.

**BASE-DETAIL-R-200**

Thank you. Email support@bluefintuna.life with BASE-DETAIL-R-200 for transfer instructions. Prepare detailed scope/BOQ, dates, approved labor MH budgets, cost allocations and rates. Materials excluded. Up to 200 activities; XER + PDF + Excel and narrative; 2 revisions. 12 business days after accepted inputs and scope.

**UPDATE-NR-200**

Thank you. Email support@bluefintuna.life with UPDATE-NR-200 for transfer instructions. Prepare XER, approved baseline, data date, actual dates, remaining durations and progress report. No MH/cost data needed. One period, up to 200 activities; updated XER + PDF. 4 business days after accepted inputs and scope.

**UPDATE-R-200**

Thank you. Email support@bluefintuna.life with UPDATE-R-200 for transfer instructions. Prepare an existing labor/cost-loaded XER, baseline, data date, progress, actual/remaining MH and costs. No initial loading or material updates. One period, up to 200 activities; XER + PDF. 5 business days after accepted inputs and scope.

## Safe activation record

Record the SKU, public link, exact product and amount, one-time status, reviewer, verification date and sandbox outcome. Store public URLs only in `data/payment-links.json`. Never add secret keys, bank data, project files or identity documents. Leave every unverified SKU null.

Stripe professional-service payments remain separate from App Store application purchases and entitlements. Existing app support and privacy destinations must stay available independently of commerce activation.
