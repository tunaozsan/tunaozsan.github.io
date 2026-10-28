import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
const root=process.cwd(); const read=p=>readFileSync(p,'utf8');
const excluded=new Set(['.git','.qa','src','scripts','tests','docs','node_modules','cloudflare']);
const walk=(dir='.')=>readdirSync(dir,{withFileTypes:true}).flatMap(d=>excluded.has(d.name)?[]:d.isDirectory()?walk(join(dir,d.name)):[join(dir,d.name)]);
const pages=walk().filter(p=>p.endsWith('.html'));
let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const asFile=path=>path.endsWith('/')?`${path}index.html`:path;
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
for(const path of pages){const html=read(path);check((html.match(/<h1[ >]/g)||[]).length===1,`${path}: exactly one h1`);check(/<html lang="en"/.test(html),`${path}: language`);check(/<meta name="description" content="[^"]+"/.test(html),`${path}: description`);check(/<link rel="canonical" href="https:\/\/bluefintuna.life\//.test(html),`${path}: canonical`);check(html.includes('mailto:support@bluefintuna.life'),`${path}: email fallback`);check(!/github_pat_|ghp_[A-Za-z0-9]{20}|sk_live_[A-Za-z0-9]|\bundefined\b|\[object Object\]/.test(html),`${path}: no secret or missing interpolation`);
for(const m of html.matchAll(/(?:href|src)="([^"]*)"/g)){const url=decode(m[1]);if(/^(?:https?:|mailto:|tel:|data:)/.test(url))continue;const [rawPath,hash]=url.split('#');const pathname=rawPath.split('?')[0];let dest=pathname?resolve(pathname.startsWith('/')?root:dirname(resolve(path)),'.'+(pathname.startsWith('/')?pathname:'/'+pathname)):resolve(path);dest=asFile(dest+(pathname.endsWith('/')?'/':''));if(!existsSync(dest)&&existsSync(join(dest,'index.html')))dest=join(dest,'index.html');check(existsSync(dest),`${path}: missing ${url}`);if(hash&&dest.endsWith('.html'))check(read(dest).includes(`id="${decodeURIComponent(hash)}"`),`${path}: missing anchor ${url}`);}
for(const a of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g))check(/rel="[^"]*noopener[^\"]*noreferrer/.test(a[0]),`${path}: safe external link`);
}
const policy=read('privacy.html');const baseline=read('src/legacy/privacy.html');
const normalized=s=>s.replace(/\s+/g,' ').trim();
for(const p of baseline.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/g))check(normalized(policy).includes(normalized(p[1])),'Original privacy paragraph preserved');
check(read('index.html').match(/id="contact"[\s\S]*mailto:support@bluefintuna.life/),'Homepage contact without JS');check(read('company.html').includes('+90 543 675 40 31'),'Public phone preserved');check(read('CNAME').trim()==='bluefintuna.life','Custom domain preserved');
const approved=[[199,150,5],[499,75,5],[799,75,7],[999,200,10],[1499,200,12],[399,200,4],[649,200,5]];
const catalog=JSON.parse(read('data/services.json'));const links=JSON.parse(read('data/payment-links.json'));check(catalog.services.length===7,'Seven independent packages');
catalog.services.forEach((s,i)=>{assert.deepEqual([s.price,s.maxActivities,s.businessDays],approved[i],s.sku);checks++;check(/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(links[s.sku]),'Valid Stripe payment URL'); const card=read('planning/services/index.html').split(`id="${s.sku}"`)[1].split('</article>')[0];check(card.includes('href="/project-portal/?sku='),`${s.sku}: gated portal entry`);check(read('planning/services/index.html').includes(`id="${s.sku}"`),'Service anchor');});
for(const p of ['service-terms.html','refund-policy.html']){check(read(p).includes('content="noindex,follow"'),`${p} draft not indexed`);check(!read('sitemap.xml').includes('/'+p),`${p} not in sitemap`);}
check(new Set(Object.values(links)).size===7,'Seven historical payment references retained');
check(!pages.some(p=>read(p).includes('https://buy.stripe.com/')),'No live static checkout bypass in release candidate');
check(read('assets/scripts/portal-config.js').includes("API_ORIGIN = ''"),'Frontend activation gate closed');
for(const p of pages) for(const m of read(p).matchAll(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/g)) check(Object.values(links).includes(m[1]),'Only configured checkout links');
check(read('assets/styles/site.css').includes('prefers-reduced-motion'),'Reduced motion support');
console.log(`PASS: ${checks} assertions across ${pages.length} pages. Legacy company-logo remote blob must remain unchanged at deployment.`);
