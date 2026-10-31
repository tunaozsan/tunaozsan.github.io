import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import { build } from '../cloudflare/worker/node_modules/esbuild/lib/main.js';
const root=resolve(import.meta.dirname,'..');
const cfg=JSON.parse(readFileSync(resolve(root,'cloudflare/worker/wrangler.jsonc'),'utf8'));
if(cfg.name!=='bluefin-project-portal-api'||cfg.vars.APP_ENV!=='production'||cfg.d1_databases[0].database_id!=='c21cc680-8df5-4f81-b411-20d18b0e5f37'||cfg.r2_buckets[0].bucket_name!=='bluefin-project-uploads') throw Error('Production resource mismatch');
const out=resolve(root,'cloudflare/worker/.build/production-assets');mkdirSync(out,{recursive:true});cpSync(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});
for(const file of ['project-portal/index.html','admin/index.html','payment/success/index.html','payment/cancel/index.html','service-terms.html','refund-policy.html','privacy.html','privacy/index.html','support/index.html','support.html','contact/index.html','site.webmanifest']){
 const dest=resolve(out,file);mkdirSync(dirname(dest),{recursive:true});let s=readFileSync(resolve(root,file),'utf8');
 // Keep navigation to the main site while portal and legal paths stay same-origin.
 if(file.endsWith('.html')) s=s.replace(/href="\/(planning\/[^"?]*|software\/|about\/|company.html|#contact)"/g,'href="https://bluefintuna.life/$1"');
 writeFileSync(dest,s);
}
mkdirSync(resolve(out,'project-portal/delivery'),{recursive:true});
cpSync(resolve(root,'src/delivery-page.html'),resolve(out,'project-portal/delivery/index.html'));
await build({entryPoints:[resolve(root,'src/delivery-client.ts')],bundle:true,format:'esm',platform:'browser',outfile:resolve(out,'assets/scripts/delivery.js')});
mkdirSync(resolve(out,'admin/applications'),{recursive:true});
writeFileSync(resolve(out,'admin/applications/index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Application inbox · Bluefin Tuna</title><link rel="stylesheet" href="/assets/styles/site.css"><link rel="stylesheet" href="/assets/styles/portal.css"><main class="container portal-intro"><p class="eyebrow">BLUEFIN TUNA / PROTECTED INBOX</p><h1>Project requests.</h1><p>Review exact scope and documented transaction-tax treatment before issuing a customer invitation. Customer intake and collection are controlled separately.</p><p><a class="button" href="/api/v1/admin/applications">Sign in / view protected records</a></p><button class="button" id="load-applications">Load applications</button><p role="status" id="inbox-status"></p><div id="inbox"></div><a href="/admin/">Admin workspace</a></main><script src="/assets/scripts/application-inbox.js" defer></script></html>`);
await build({entryPoints:[resolve(root,'src/application-inbox.ts')],bundle:true,format:'esm',platform:'browser',outfile:resolve(out,'assets/scripts/application-inbox.js')});
writeFileSync(resolve(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('Production assets built for existing Worker; no staging test tools.');

if (cfg.vars.LIVE_MAINTENANCE_UNTIL) {
 mkdirSync(resolve(out,'admin/stripe-maintenance'),{recursive:true});
 writeFileSync(resolve(out,'admin/stripe-maintenance/index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Payment integration · Bluefin Tuna</title><link rel="stylesheet" href="/assets/styles/site.css"><main class="container portal-intro"><h1>Complete payment integration.</h1><p>Protected, time-limited operator setup. Customer payments remain closed.</p><p><a href="/api/v1/admin/stripe-readiness">Verify admin sign-in</a></p><button class="button" data-action="refund-webhook">Subscribe existing webhook to refunds</button><button class="button" data-action="missing-update-addon">Complete missing $150 Update add-on</button><button class="button" data-action="inspect-legacy-links">Inspect legacy sessions</button><button class="button" data-action="retire-legacy-links">Retire eight legacy links</button><pre role="status" id="result"></pre></main><script src="/assets/scripts/stripe-maintenance.js" defer></script></html>`);
 writeFileSync(resolve(out,'assets/scripts/stripe-maintenance.js'),`const api=async(b)=>{const r=await fetch('/api/v1/admin/stripe-maintenance',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Admin sign-in required');const data=await r.json();if(!r.ok)throw Error(data.error);return data};for(const b of document.querySelectorAll('[data-action]'))b.onclick=async()=>{b.disabled=true;const out=document.getElementById('result');out.textContent='Working…';try{if(b.dataset.action==='retire-legacy-links'){const inventory=await api({action:'inspect-legacy-links'}),results=[];for(const l of inventory.links){const r=await api({action:'retire-legacy-links',linkId:l.id});results.push(...r.links);out.textContent=JSON.stringify({action:'retire-legacy-links',links:results,completed:results.length},null,2)}}else out.textContent=JSON.stringify(await api({action:b.dataset.action}),null,2)}catch(e){out.textContent+='\\nError: '+e.message}finally{b.disabled=false}};`);
} else {
 rmSync(resolve(out,'admin/stripe-maintenance'),{recursive:true,force:true});
 rmSync(resolve(out,'assets/scripts/stripe-maintenance.js'),{force:true});
}

if (cfg.vars.LIVE_WEBHOOK_SETUP_ID) {
mkdirSync(resolve(out,'admin/stripe-setup'),{recursive:true});
writeFileSync(resolve(out,'admin/stripe-setup/index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Stripe connection · Bluefin Tuna</title><link rel="stylesheet" href="/assets/styles/site.css"><main class="container portal-intro"><p class="eyebrow">PROTECTED OPERATOR SETUP</p><h1>Connect payment events.</h1><p>Configure the production webhook using the existing merchant account. This does not open customer payments.</p><p><a href="/api/v1/admin/stripe-readiness">Verify admin sign-in and merchant</a></p><button class="button" id="setup-hook">Configure production webhook</button><p role="status" id="setup-status"></p><button class="button" id="save-setup" disabled>Save encrypted setup result</button></main><script src="/assets/scripts/stripe-setup.js" defer></script></html>`);
writeFileSync(resolve(out,'assets/scripts/stripe-setup.js'),`let result;const status=document.getElementById('setup-status'),button=document.getElementById('setup-hook'),save=document.getElementById('save-setup');button.onclick=async()=>{button.disabled=true;status.textContent='Configuring payment events…';try{const r=await fetch('/api/v1/admin/stripe-webhook-setup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Admin sign-in is required.');const body=await r.json();if(!r.ok)throw Error(body.error||'Setup unavailable');result=body;status.textContent=body.configured?'Webhook already connected.':'Webhook created. Save the encrypted transfer file to complete the Worker secret connection.';save.disabled=!body.encryptedSecret}catch(e){status.textContent=e.message}finally{button.disabled=false}};save.onclick=()=>{const blob=new Blob([JSON.stringify(result)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bluefin-webhook-setup-'+result.generation+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};`);

} else {
  rmSync(resolve(out,'admin/stripe-setup'),{recursive:true,force:true});
  rmSync(resolve(out,'assets/scripts/stripe-setup.js'),{force:true});
}
