import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from '../cloudflare/worker/node_modules/esbuild/lib/main.js';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, 'cloudflare/worker/wrangler.staging.jsonc'), 'utf8'));
if (config.name !== 'bluefin-project-portal-staging' || config.vars.APP_ENV !== 'test' ||
    config.d1_databases[0].database_id !== 'f87e0350-e5ef-4173-a728-a0678b882c23' ||
    config.r2_buckets[0].bucket_name !== 'bluefin-project-uploads-staging') {
  throw new Error('Staging isolation check failed');
}
const out = resolve(root, 'cloudflare/worker/.build/staging-assets');
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
cpSync(resolve(root, 'site.webmanifest'), resolve(out, 'site.webmanifest'));
for (const file of ['project-portal/index.html', 'admin/index.html', 'payment/success/index.html', 'payment/cancel/index.html', 'service-terms.html', 'refund-policy.html', 'privacy.html', 'privacy/index.html', 'support/index.html', 'support.html', 'contact/index.html']) {
  let html = readFileSync(resolve(root, file), 'utf8');
  html = html.replaceAll('https://bluefin-project-portal-api.bluefintuna-llc.workers.dev', config.vars.PUBLIC_SITE_ORIGIN);
  html = html.replace(/<body([^>]*)>/, '<body$1><aside role="note" class="notice">STAGING · TEST ONLY · Synthetic files only · No real payments</aside>');
  mkdirSync(dirname(resolve(out, file)), { recursive: true });
  writeFileSync(resolve(out, file), html);
}
writeFileSync(resolve(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
const frontendConfig = `export const API_ORIGIN=${JSON.stringify(config.vars.PUBLIC_SITE_ORIGIN)};\nexport const TURNSTILE_SITE_KEY=${JSON.stringify(config.vars.TURNSTILE_SITE_KEY || "")};\nexport const DEFAULT_LOCALE='en';\nexport const VALIDATED_LOCALES=['en'];\n`;
writeFileSync(resolve(out, 'assets/scripts/portal-config.js'), frontendConfig);
await build({
  entryPoints: [resolve(root, 'src/portal-client.ts')], bundle: true, format: 'esm', platform: 'browser',
  outfile: resolve(out, 'assets/scripts/portal.js'),
  plugins: [{ name: 'staging-config', setup(builder) {
    builder.onLoad({ filter: /portal-config\.js$/ }, () => ({ contents: frontendConfig, loader: 'js' }));
  } }],
});
console.log('Built isolated staging assets; production generated files unchanged.');

mkdirSync(resolve(out, 'project-portal/delivery'), { recursive: true });
cpSync(resolve(root, 'src/delivery-page.html'), resolve(out, 'project-portal/delivery/index.html'));
await build({ entryPoints: [resolve(root, 'src/delivery-client.ts')], bundle: true, format: 'esm', platform: 'browser', outfile: resolve(out, 'assets/scripts/delivery.js') });
