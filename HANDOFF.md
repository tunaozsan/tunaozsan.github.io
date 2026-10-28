# Delivery notes — October 28, 2026

## Implemented
- Premium marine-blue static redesign using the supplied Bluefin Tuna logo.
- 16 canonical pages, privacy/support compatibility aliases and custom 404.
- Project planning hub, seven distinct service packages, comparisons, resource/material scope, quote enquiries, software portfolio, contact and support.
- Verified Apple listings for SnappiQ, Secure Safe, WiFi Media Transfer and Auralith Hi-Res.
- Original privacy paragraphs and company information preserved. Exact support email and public phone retained.
- Root /privacy.html, /company.html and /#contact remain; /support/, /support.html and /privacy/ provide useful compatible content.
- Static content works without JavaScript. English-only complete launch; other locales are not represented as translated.

## Still requires owner configuration
- App Store Connect: verify the configured Privacy and Support URLs for every app. Public storefront checks confirmed privacy.html for three apps, but private Support URL settings are inaccessible. No claim of Apple approval or complete app-specific privacy compliance is made.
- Privacy: current original policy is website/business-focused. Review each app’s actual data practices and add accurate product-specific policy details if required.
- Stripe: all seven links are null; customers can enquire by email. Supply and verify one active one-time link per SKU. No combined checkout is used. See docs/stripe-setup-checklist.md.
- Proposed terms/refunds are explicitly drafts and noindex, with written agreement required. Owner/legal review, resource-category caps, tax treatment and refund terms remain open.
- File transfer: contact first for agreed transfer instructions; no fake secure portal or upload endpoint.

## Publishing and rollback
Baseline production commit: d5123c501f23727e5804d62465bbe5e17231b3a7.
Baseline tree: 39e757392183447d70798ca0f9e9f040feb8bd03.
Preserve legacy assets/company-logo.png blob 5c41a84c46860906b3a2819f223757271f29ecf6 and CNAME.

Initial host DNS failures were resolved. The original production Git history was fetched, the working branch is based on it, and the historical logo was restored byte-for-byte. Publication uses a normal branch/PR merge without force push. The supplied master PNG is preserved alongside optimized derivatives.

Rollback by reverting the release commit/PR through GitHub (not force-pushing). Keep CNAME unchanged and verify /, /privacy.html, /company.html, /#contact and /support/ after deployment.

## Verification
See docs/qa-report.md. Static checks pass; browser QA covers representative views and interactions. Live deployment status is reported separately once GitHub Pages completes. No Lighthouse score or real-device iOS Safari result is claimed without a measured run.
