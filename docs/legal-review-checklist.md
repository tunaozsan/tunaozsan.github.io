# Legal and Apple continuity review

Audit date: October 28, 2026. This is an implementation checklist, not legal approval or an assertion that Apple will approve an app or website.

## Evidence and content status

| Item | Source | Implementation/status |
| --- | --- | --- |
| Legal identity: Bluefin Tuna LLC; U.S.-based software company | Existing `company.html`, existing homepage, public App Store seller identity | Preserve established identity and software activities. The new planning activity is supplied in the owner's master brief. |
| Official email and phone | Existing home/company/privacy pages | Keep `support@bluefintuna.life`, `+90 543 675 40 31`, `mailto:support@bluefintuna.life`, and `tel:+905436754031`. No invented office hours or response-time promise. |
| Existing privacy commitments | Existing `privacy.html`, effective March 30, 2026 | Retain every existing paragraph and the original effective date. This includes the no-sale statement, website hosting/logs, email communications, limited sharing, retention, infrastructure, choices, and contact. |
| Additional privacy/support note | Actual contact mechanism implemented by this rebuild | A separately headed section points app users to support and privacy-request email. It does not infer app collection, encryption, cloud storage, tracking, consent, or deletion behavior. |
| App-specific privacy policy | Public app labels show developer-reported “Data Not Collected”; deployed app and App Store Connect data flows not inspected | **OWNER VERIFICATION REQUIRED.** The old policy principally describes the website. Inventory each app's permissions, local/cloud behavior, SDKs, purchase processing, diagnostics, third parties, retention, deletion, and consent withdrawal. Approve app-specific disclosures before claiming complete App Review guideline 5.1.1 coverage. |
| SnappiQ, Secure Safe, WiFi Media Transfer, Auralith Hi-Res | Official Apple storefront pages listed below | Safe to link the verified published products and minimal factual descriptions. Do not copy volatile prices, ratings, app versions, availability promises, or unsupported security claims. |
| NUR TAROT, GoSafely, BeverlyHills86 | Only candidate names in the brief; searches did not establish official seller-matched listings | Omitted from the public portfolio; no publication or development-status claim. |
| Seven planning packages and exclusions | Owner-supplied master brief, sections 4 and 6 | Scope and commercial proposal; confirm in a written quotation. No fabricated payment URLs. |
| Service terms | Owner brief, section 6.2 | Public **draft for discussion**, not yet effective; `noindex`. Written agreement required. No invented governing law or absolute waiver. |
| Cancellation/refund policy | Suggested draft in owner brief, section 6.2 | Public **draft for discussion**, not yet effective; `noindex`. Proportionate unperformed-work refunds, correction process, and mandatory rights retained. Owner and suitable counsel review required before payment activation. |
| Resource-category caps | Brief explicitly calls proposed 10/5 and 20/10 caps unconfirmed | Terms defer category limits to written agreement. Do not silently finalize these caps. |
| Confidentiality, IP/license, retention of project files | Actual operational agreement/provider not supplied | Terms identify what the written agreement must settle. No claim that an upload portal exists or that ordinary email is secure file transfer. |
| Payments and taxes | No verified individual Payment Links supplied | Enquiry only. Do not activate checkout or claim Stripe invoice, consent, refund, tax, or security settings have been configured. |
| App Store digital purchases | Existing apps sell via Apple; planning is a separate human service | Keep app purchases and entitlements separate. Support points purchase issues to Apple's own service. No Stripe substitute for app IAP. |

## Before enabling a paid service checkout

- Approve the service terms and refund policy with jurisdiction-appropriate advice, set an actual effective date, and remove draft/noindex status only when approved.
- Confirm contracting identity/contact requirements, tax treatment, governing law and dispute process, liability provisions, intellectual-property terms, and business-day definition.
- Confirm each package's boundaries, revision-review period, resource-category caps, suitability review, incomplete-input handling, cancellation process, and how completed work is valued.
- Define authorized project-file access, suitable transfer/storage providers, confidentiality, retention/deletion, and cross-border handling. Update privacy text only to match real operations.
- Verify the seven individual Stripe links, each with a single correct SKU and one-time amount. Confirm legal URLs and consent, receipts/invoices, support identity, taxes, and sandbox checkout. No bundled mixed-package link.

## Before declaring all Apple compatibility checks complete

- Verify Support URL and Privacy Policy URL for every live app, platform, locale, and relevant pending version in App Store Connect. Public web storefronts did not expose the configured Support URL during this audit.
- Check app-embedded links as well as store metadata. Preserve exact paths, anchors, casing, and any query behavior in actual use.
- Test these URLs on iOS Safari with JavaScript disabled where possible, plus a normal desktop browser: `/privacy.html`, `/#contact`, `/company.html`, `/support/`, and all additional configured URLs.
- Review each app's deployed data practices and privacy disclosures. Storefront “Data Not Collected” labels are developer statements and do not independently establish every implementation detail.
- Keep an app-facing privacy link easily available in the app and in the required metadata. A functional URL alone does not prove a complete app privacy policy.
- No App Store Connect settings or app binaries were modified by this website work.

## Official sources checked

- [Apple App Review: broken links and support/privacy links](https://developer.apple.com/app-store/review/).
- [Apple App Review Guidelines, 5.1.1](https://developer.apple.com/app-store/review/guidelines/): privacy disclosures must describe app collection/use, third parties, retention/deletion, and consent/deletion choices.
- [Apple App Store Connect: platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information): Support URL must lead to actual contact information so users can raise app issues and feedback.
- [SnappiQ](https://apps.apple.com/us/app/snappiq/id6758950007): Bluefin Tuna LLC; direct privacy-link click resolved to `https://bluefintuna.life/privacy.html`.
- [Secure Safe](https://apps.apple.com/us/app/secure-safe/id6799602581): Bluefin Tuna LLC; direct privacy-link click resolved to the same legacy URL.
- [WiFi Media Transfer](https://apps.apple.com/us/app/wifi-media-transfer/id6809104231): Bluefin Tuna LLC; direct privacy-link click resolved to the same legacy URL.
- [Auralith Hi-Res](https://apps.apple.com/us/app/auralith-hi-res/id6812219005): official Apple search result confirmed title, seller, and app description; direct open intermittently returned rate-limit/cache errors. The exact privacy target for this app still needs independent confirmation.

## Content that is deliberately not claimed

No Apple/legal approval; no guaranteed regulatory compliance; no blanket zero-data assertion for all apps; no invented data controller address; no fabricated awards, testimonials, ratings, certifications, clients, tax exemption, refund-processing SLA, security certification, or Oracle partnership. Existing public address or private seller records are not expanded into new site claims without owner confirmation.
