# Legacy routes and App Store continuity

Baseline inspected October 28, 2026. Source repository: `tunaozsan/tunaozsan.github.io`; production domain: `bluefintuna.life`. This matrix separates source verification from post-deployment verification. A file in the repository is not, by itself, proof of a successful production response.

| Destination | Baseline evidence | Required rebuild behavior | Verification state |
| --- | --- | --- | --- |
| `/` | Public homepage fetched; company/software identity and contact visible | Static home, same domain, usable without JavaScript | Source implementation; final live check required after deployment |
| `/#contact` | Existing homepage has real contact section with official email/phone; user explicitly identified this destination | Visible nonempty `id="contact"` section, working email and phone, no JavaScript dependency | Root rebuild must test anchor visibility and real links with JS off |
| `/privacy.html` | Public policy fetched; existing HTML inspected. SnappiQ, Secure Safe, and WiFi Media Transfer privacy links clicked through to this exact URL | Keep exact file, canonical, every original policy paragraph, effective date, and contacts; add separately identified app-support navigation only | Content preservation and final HTTP 200 must be tested; app-specific privacy review remains open |
| `/company.html` | Existing repository HTML inspected; direct web fetch returned cache miss (not proof of HTTP failure) | Preserve company identity, established year, software activities, contacts, official-domain statement | Source preservation and final live check required |
| `/assets/company-logo.png` | Legacy favicon, Apple touch icon and OG references use this path | Keep legacy asset path working while adding supplied-logo derivatives | Verify file retained in published output |
| `/CNAME` | Existing file maps `bluefintuna.life` | Preserve domain value and hosting configuration | Verify published source/output |
| `/robots.txt`, `/sitemap.xml`, `/site.webmanifest` | Existing source files present | Keep functional; sitemap only lists real indexable canonical routes | Build and live verification required |
| `/support/` | Not in original root file inventory | Add a substantive static `support/index.html` with contact, app help, privacy-request process, and no login/payment wall | New file; final HTTP 200 required |
| `/support` | Usage in App Store Connect not available | GitHub Pages normal directory behavior should resolve to `/support/` | Must verify final live behavior; do not claim tested from local static server alone |
| `/support.html` and `/privacy/` | No evidence these are configured; plausible aliases | Add useful aliases only if root implementation includes them; never redirect privacy to marketing/checkout | Unknown usage, not verified legacy routes |
| `/contact/`, `/about/`, `/software/` | New complementary routes | Real directory `index.html` files, reload-safe and crawlable | Build/live checks required |
| `/service-terms.html`, `/refund-policy.html` | New proposed commercial documents | Publicly readable, clearly draft and not yet effective; noindex until approval | Owner/legal approval required before checkout activation |
| `mailto:support@bluefintuna.life` | Exact email on legacy home, company, privacy pages | Same visible and clickable address on all support/legal routes | Preserve exactly |
| `tel:+905436754031` | Exact legacy telephone link and displayed `+90 543 675 40 31` | Same public phone on contact/support/legal routes | Preserve exactly |

## Storefront link evidence

| Published app | Official listing | Privacy URL confirmed by clicking Apple link | Support URL |
| --- | --- | --- | --- |
| SnappiQ | `https://apps.apple.com/us/app/snappiq/id6758950007` | `https://bluefintuna.life/privacy.html` | **OWNER VERIFICATION REQUIRED** |
| Secure Safe | `https://apps.apple.com/us/app/secure-safe/id6799602581` | `https://bluefintuna.life/privacy.html` | **OWNER VERIFICATION REQUIRED** |
| WiFi Media Transfer | `https://apps.apple.com/us/app/wifi-media-transfer/id6809104231` | `https://bluefintuna.life/privacy.html` | **OWNER VERIFICATION REQUIRED** |
| Auralith Hi-Res | `https://apps.apple.com/us/app/auralith-hi-res/id6812219005` | Exact target not independently resolved; rate-limit/cache errors | **OWNER VERIFICATION REQUIRED** |

Seller identity Bluefin Tuna LLC was verified in all four official listings. Storefront fetches may be cached and do not prove worldwide availability. Other candidate app names from the brief were not established as published apps and are omitted.

## Release checks

1. Test real HTTP responses after publishing; do not infer production status from the build.
2. Load privacy, company, support, and home contact with JavaScript disabled and confirm content remains available.
3. Confirm no automatic language redirect or checkout/login intercept affects legacy routes.
4. Check all stored app Support/Privacy URLs in App Store Connect and in deployed app settings. This is unresolved until the owner supplies or verifies those settings.
5. Compare the retained privacy paragraphs to the original source; add-on text must not replace commitments or infer app data practices.
6. Keep the prior production commit available and use a normal revert if a compatibility check fails; do not force-push or change the custom domain to hide a failure.

Official reference: [Apple App Review](https://developer.apple.com/app-store/review/) and [Support URL requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).
