import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync('data/legal/service-terms-2026-10-30-v2.json');const policy=JSON.parse(raw);
const source=readFileSync('cloudflare/worker/src/agreement.ts','utf8');
assert.ok(source.includes(createHash('sha256').update(raw).digest('hex')));assert.equal(policy.status,'APPROVED');assert.equal(policy.effectiveDate,'2026-10-30');assert.equal(policy.externalLegalReview,'NOT_PERFORMED');
const page=readFileSync('project-portal/index.html','utf8');assert.match(page,/<input id="consent"[^>]*required/);assert.ok(!/<input id="consent"[^>]*\bchecked/.test(page));assert.ok(page.includes(policy.acceptanceLabel));
for(const file of ['service-terms.html','refund-policy.html']){const html=readFileSync(file,'utf8');assert.ok(html.includes(policy.version));assert.match(html,/Effective 30 October 2026/);}
const old=JSON.parse(readFileSync('docs/agreement-legacy-baseline-2026-10-30.json','utf8'));
for(const [p,hash]of Object.entries(old).filter(([p])=>p!=='index.html'))assert.equal(createHash('sha256').update(readFileSync(p,'utf8').replace('>Service Terms</a>','>Proposed Service Terms</a>')).digest('hex'),hash,p+' changed');
const privacy=readFileSync('privacy.html','utf8');const legacy=readFileSync('src/legacy/privacy.html','utf8').match(/<main[^>]*>([\s\S]*?)<\/main>/)[1].replace(/<footer>[\s\S]*?<\/footer>/,'');assert.ok(privacy.includes(legacy));assert.ok(privacy.includes('personally held Google Drive'));assert.ok(privacy.includes('does not waive privacy rights'));
const rows=JSON.parse(readFileSync('data/agreement-product-coverage.json','utf8')).products;assert.equal(rows.length,22);assert.ok(rows.every(x=>x.agreementVersion===policy.version));assert.equal(rows.filter(x=>x.standaloneAllowed===false).length,14);
assert.equal(readFileSync('assets/legal/'+policy.version+'.json','utf8'),raw.toString());
console.log('PASS: agreement bundle hash, owner publication labels, unchecked mandatory consent, 22-product common coverage and unchanged Apple legacy routes/disclosures.');
const { legalHtml } = await import('../src/legal-agreement.mjs');
assert.equal(legalHtml('### Clause\n\n**Draft** [Refund](https://bluefintuna.life/refund-policy.html)'),'<h3>Clause</h3>\n<p><strong>Draft</strong> <a href="/refund-policy.html">Refund</a></p>');
assert.ok((readFileSync('service-terms.html','utf8').match(/<h3>/g)||[]).length>=11);

assert.ok(readFileSync("index.html","utf8").includes(readFileSync("tests/fixtures/home-contact-preserved.html","utf8")),"Apple homepage contact section unchanged");
assert.ok(!readFileSync("service-terms.html","utf8").includes("[PUBLICATION_DATE_UTC]"));
