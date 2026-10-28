# Bluefin Tuna LLC website

Static GitHub Pages website for https://bluefintuna.life/.

## Maintain

Requires Node 20+. No npm dependencies. Run `npm run build`, then `npm test`. Preview with `npm run preview`.

Edit `src/home.mjs`, `src/layout.mjs`, `src/planning.mjs`, `src/content.mjs`, shared CSS/JS and `data/services.json`; the build generates root and directory HTML routes. Root legacy routes remain in place. Original policy/company source is preserved under `src/legacy` for regression checks. Never store customer project documents or credentials in this repository.

Prices and limits come from `data/services.json`. All payment links intentionally remain null until independently verified; the UI offers honest email enquiries. New legal terms are drafts, marked noindex, and require owner/legal review before becoming effective.

See HANDOFF.md and docs/ for compatibility, Stripe setup and QA. Publishing uses the existing GitHub Pages source and unchanged CNAME. Do not change DNS or the configured App Store URLs to complete a visual update.
