import { execFileSync } from 'node:child_process';
import { portalPages } from '../src/portal.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { render } from '../src/layout.mjs';
import { home } from '../src/home.mjs';
import { pages as planningPages, serviceCards, faqHtml } from '../src/planning.mjs';
import { pages as contentPages, privacySupportNote } from '../src/content.mjs';
execFileSync('cloudflare/worker/node_modules/.bin/esbuild',['src/portal-client.ts','--bundle','--format=esm','--outfile=assets/scripts/portal.js','--platform=browser'],{stdio:'inherit'});
const legacy = name => readFileSync(`src/legacy/${name}.html`, 'utf8').match(/<main[^>]*>([\s\S]*?)<\/main>/)[1].replace(/<footer>[\s\S]*?<\/footer>/, '');
const legacyPage=(name, title, description, extra='') => ({path:`/${name}.html`,title,description,body:`<section class="legal-reading"><div class="container"><article class="prose">${legacy(name)}${extra}</article></div></section>`});
const pages=[{path:'/',title:'Project Planning & Software Solutions',description:'Bluefin Tuna LLC brings clarity to complex projects and digital products. Explore Primavera P6 planning, schedule audits, project controls and published mobile apps.',body:home(serviceCards,faqHtml)},...planningPages,...contentPages,...portalPages,
legacyPage('privacy','Privacy Policy','Privacy information for Bluefin Tuna LLC, the bluefintuna.life website, business communications and application support enquiries.',privacySupportNote),
legacyPage('company','Company Information','Official legal identity, software activities, website domain and contact information for Bluefin Tuna LLC.')];
const aliases=[{path:'/privacy/',from:'/privacy.html'},{path:'/support.html',from:'/support/'}];
for(const page of pages){page.title=page.title.replace(/ \| Bluefin Tuna LLC$/,'');const filename=page.path.endsWith('/')?`${page.path.slice(1)}index.html`:page.path.slice(1);mkdirSync(dirname(filename),{recursive:true});writeFileSync(filename,render(page));}
for(const alias of aliases){const source=pages.find(p=>p.path===alias.from);const filename=alias.path.endsWith('/')?`${alias.path.slice(1)}index.html`:alias.path.slice(1);mkdirSync(dirname(filename),{recursive:true});writeFileSync(filename,render({...source,noindex:true}));}
writeFileSync('404.html',render({path:'/404.html',title:'Page not found',description:'Find your way to Bluefin Tuna LLC services, privacy information and support.',noindex:true,body:'<section class="section container page-intro"><p class="eyebrow">404 / A different direction</p><h1>Let’s get you<br>back on course.</h1><p class="lead">This page is not available. Our services and support are one step away.</p><div class="actions"><a class="button" href="/">Return home ↗</a><a class="button secondary" href="/support/">Get support ↗</a><a class="button secondary" href="/privacy.html">Privacy Policy ↗</a></div></section>'}));
writeFileSync('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.filter(p=>!p.noindex).map(p=>`  <url><loc>https://bluefintuna.life${p.path}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync('robots.txt','User-agent: *\nAllow: /\nDisallow: /src/\nDisallow: /scripts/\nDisallow: /tests/\nDisallow: /docs/\nDisallow: /cloudflare/\nDisallow: /admin/\nDisallow: /payment/\n\nSitemap: https://bluefintuna.life/sitemap.xml\n');
writeFileSync('site.webmanifest',JSON.stringify({name:'Bluefin Tuna LLC — Project Planning & Software Solutions',short_name:'Bluefin Tuna',start_url:'/',display:'browser',background_color:'#061224',theme_color:'#061224',icons:[{src:'/assets/brand/apple-touch-icon.png',sizes:'180x180',type:'image/png'}]},null,2)+'\n');
console.log(`Built ${pages.length} canonical pages, ${aliases.length} compatibility aliases and a 404 page.`);
