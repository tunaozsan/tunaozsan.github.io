import { readFileSync } from 'node:fs';
export const agreement = JSON.parse(readFileSync(new URL('../data/legal/service-terms-2026-10-30-v2.json', import.meta.url), 'utf8'));
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inline = s => escape(s)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replaceAll('href="https://bluefintuna.life/', 'href="/')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');
export const legalHtml = text => text.trim().split(/\n\s*\n/).map(p => {
  if (p.startsWith('|')) {
    const rows=p.split('\n').filter(row=>!/^\|[\s:|\-]+\|$/.test(row));
    return '<div class="legal-table"><table>'+rows.map((row,i)=>'<tr>'+row.split('|').slice(1,-1).map(cell=>`<${i?'td':'th'}>${inline(cell.trim())}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>';
  }
  if(p.split('\n').every(line=>line.startsWith('- '))) return '<ul>'+p.split('\n').map(line=>'<li>'+inline(line.slice(2))+'</li>').join('')+'</ul>';
  const heading = p.match(/^(#{1,3}) (.*)$/);
  const level = heading ? Math.min(heading[1].length + 1, 3) : 0;
  return heading ? `<h${level}>${inline(heading[2])}</h${level}>` : `<p>${inline(p).replaceAll('\n', ' ')}</p>`;
}).join('\n');
