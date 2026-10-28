# QA report — October 28, 2026

## Passed
- `npm run build`: 16 canonical pages, two compatibility aliases, custom 404.
- `npm test`: 863 assertions across 19 generated HTML pages: local links/assets/fragments, language, headings, metadata, seven package price/activity/day mappings, no invented checkout links, no exposed credentials, preserved original privacy paragraphs, legacy contact phone/email, draft noindex and sitemap exclusion.
- Browser homepage at 320, 375, 390, 768, 1024, 1440 and 1920 CSS pixels: document width equals viewport width, no horizontal overflow.
- Desktop and mobile visual inspection, screenshots in docs/screenshots/.
- Mobile navigation opens; service filter switches to only AUDIT-150; essential catalog content is rendered statically.
- Correct custom domain retained. Original legacy logo restored from production Git history.
- Original privacy and company facts retained; real contact anchor remains in initial HTML.
- No external font or tracker dependencies. Primary logo WebP approximately 24 KB.

## Limits / external verification
- App Store Connect private Support URL settings unavailable; owner must confirm each app’s configured URLs.
- Existing policy is website-focused; app-specific privacy disclosures must be checked against each actual app.
- No measured Lighthouse scores or real-device iOS Safari certification claimed. Reduced motion CSS and keyboard focus styles are present; no blanket WCAG certification.
- Stripe live checkout was not tested because verified payment links are not configured. All service enquiries use real mailto links.
- Legal terms and refund policy remain explicitly proposed drafts, not legal approval.
- Production HTTP checks are performed after Pages publication; final outcome reported in chat.
