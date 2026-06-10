#!/usr/bin/env node
/**
 * BioCommons Ghana — Graduate Programme page generator
 * ─────────────────────────────────────────────────────
 * Fetches the Graduate Programs sheet from the live Apps Script endpoint and
 * generates one static, crawlable HTML page per programme under /programmes/,
 * plus a /programmes/ index page, and regenerates sitemap.xml with every URL.
 *
 * Runs nightly via GitHub Actions (.github/workflows/generate-programmes.yml)
 * so the pages keep themselves current — you only ever edit the Sheet.
 *
 * Usage:
 *   node scripts/generate-programmes.mjs           # live data
 *   node scripts/generate-programmes.mjs --mock    # built-in fixtures (testing)
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://biocommonsghana.org';
const API  = 'https://script.google.com/macros/s/AKfycbzDfl9FxRfdm-tdiLYdVdKuFdor6kdcS-eIw26WJ448yuU76JA_WEtuiu-YZ86hojJ8/exec';
const OUT  = 'programmes';
const MOCK = process.argv.includes('--mock');

// ── fixtures for local testing (mirror of doGet's payload shape) ─────────────
const FIXTURES = [
  { title:'MPhil Biochemistry', host:'Department of Biochemistry, University of Ghana', country:'Ghana',
    deadline:'31 October 2026', link:'https://www.ug.edu.gh', description:'A good first degree (minimum Second Class Lower) in Biochemistry or a related field.\nPass a selection interview.',
    degree:'MPhil', funding:'2 years', opens:'', closed:'', added:'2026-05-20T10:00:00.000Z' },
  { title:'PhD Molecular Cell Biology of Infectious Diseases', host:'WACCBIP, University of Ghana', country:'Ghana',
    deadline:'15 September 2026', link:'https://www.waccbip.org', description:'MPhil/MSc in a relevant biological science discipline. Research proposal required.',
    degree:'PhD', funding:'4 years', opens:'', closed:'', added:'2026-05-22T10:00:00.000Z' },
  { title:'MSc Biotechnology', host:'KNUST', country:'Ghana',
    deadline:'30 November 2026', link:'', description:'First degree in Biochemistry, Biological Sciences, Agriculture or related.',
    degree:'MSc', funding:'1 year', opens:'', closed:'CLOSED', added:'2026-05-25T10:00:00.000Z' },
  { title:'MPhil Biochemistry', host:'University of Cape Coast', country:'Ghana',   // deliberate slug collision with #1
    deadline:'TBA', link:'', description:'—', degree:'MPhil', funding:'2 years', opens:'', closed:'', added:'' },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'programme';

const cleanField = (s) => { const v = String(s ?? '').trim(); return (v === '—' || v === '#') ? '' : v; };

const paragraphs = (s) => cleanField(s).split(/\n+/).map(p => p.trim()).filter(Boolean)
  .map(p => '<p>' + esc(p) + '</p>').join('\n      ') || '<p>See the official page or the live directory for details.</p>';

// ── page template ─────────────────────────────────────────────────────────────
function programmePage(p) {
  const isClosed = String(p.closed).toUpperCase() === 'CLOSED';
  const pageTitle = `${p.title} — ${p.shortHost} | BioCommons Ghana`;
  const desc = `${p.degree ? p.degree + ' programme' : 'Graduate programme'} at ${p.host}.` +
    (p.funding ? ` Duration: ${p.funding}.` : '') +
    (p.deadline ? ` Application deadline: ${p.deadline}.` : '') +
    ' Listed on BioCommons Ghana — the free opportunities directory for Ghana\u2019s biological scientists.';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    name: p.title,
    description: cleanField(p.description) || undefined,
    educationalProgramMode: 'full-time',
    timeToComplete: p.funding || undefined,
    educationalCredentialAwarded: p.degree || undefined,
    applicationDeadline: p.deadline || undefined,
    provider: { '@type': 'CollegeOrUniversity', name: p.host, address: { '@type': 'PostalAddress', addressCountry: 'GH' } },
    url: `${SITE}/programmes/${p.slug}/`
  };
  Object.keys(schema).forEach(k => schema[k] === undefined && delete schema[k]);

  const row = (label, value, accent) => value ? `
      <div class="row"><div class="k">${label}</div><div class="v${accent ? ' accent' : ''}">${esc(value)}</div></div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${SITE}/programmes/${p.slug}/"/>
<meta property="og:title" content="${esc(p.title)} — ${esc(p.shortHost)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${SITE}/programmes/${p.slug}/"/>
<meta property="og:image" content="${SITE}/og-image.png"/>
<meta property="og:type" content="website"/>
<link rel="icon" href="${SITE}/favicon.ico"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>
:root{--cream:#FFFEFB;--paper:#FBF8F1;--dark:#0B2618;--green:#0D7C3E;--gold:#F5A623;--muted:#5C6B5E;--line:rgba(11,38,24,0.12);}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--paper);color:#15140F;line-height:1.6;-webkit-font-smoothing:antialiased;}
.top{background:var(--dark);padding:14px 5%;}
.top a{color:var(--cream);text-decoration:none;font-weight:700;font-size:15px;}
.top a span{color:var(--gold);}
main{max-width:760px;margin:0 auto;padding:44px 5% 70px;}
.crumb{font-size:12.5px;color:var(--muted);margin-bottom:22px;}
.crumb a{color:var(--green);text-decoration:none;}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
  padding:5px 13px;border-radius:50px;margin-bottom:16px;background:rgba(13,124,62,0.1);color:var(--green);}
.badge.closed{background:rgba(206,17,38,0.08);color:#CE1126;}
h1{font-family:'Playfair Display',serif;font-weight:800;font-size:clamp(26px,4.5vw,40px);line-height:1.12;letter-spacing:-0.015em;color:var(--dark);margin-bottom:8px;}
.host{font-size:16px;color:var(--muted);margin-bottom:30px;}
.card{background:var(--cream);border:1px solid var(--line);border-radius:16px;padding:8px 24px;margin-bottom:28px;}
.row{display:flex;gap:18px;padding:15px 0;border-bottom:1px dashed var(--line);}
.row:last-child{border-bottom:none;}
.k{flex:0 0 150px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);padding-top:2px;}
.v{flex:1;font-size:15.5px;font-weight:600;color:var(--dark);}
.v.accent{color:var(--gold);}
h2{font-family:'Playfair Display',serif;font-size:21px;color:var(--dark);margin:30px 0 12px;}
.req p{font-size:15px;color:#3A463C;margin-bottom:10px;}
.ctas{margin-top:36px;display:flex;gap:14px;flex-wrap:wrap;}
.btn{display:inline-block;text-decoration:none;font-weight:800;font-size:14.5px;padding:14px 28px;border-radius:50px;transition:transform .2s;}
.btn:hover{transform:translateY(-2px);}
.btn.gold{background:var(--gold);color:#1A0C00;box-shadow:0 8px 26px rgba(245,166,35,0.3);}
.btn.line{border:2px solid var(--dark);color:var(--dark);}
.note{margin-top:30px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:18px;}
footer{background:var(--dark);color:rgba(255,254,251,0.6);text-align:center;padding:26px 5%;font-size:12.5px;}
footer b{color:var(--gold);font-weight:600;letter-spacing:0.06em;}
</style>
</head>
<body>
<div class="top"><a href="${SITE}/">BioCommons <span>Ghana</span></a></div>
<main>
  <nav class="crumb"><a href="${SITE}/">Home</a> / <a href="${SITE}/programmes/">Graduate Programmes</a> / ${esc(p.degree || 'Programme')}</nav>
  <span class="badge${isClosed ? ' closed' : ''}">${isClosed ? 'Applications currently closed' : 'Graduate programme · Ghana'}</span>
  <h1>${esc(p.title)}</h1>
  <div class="host">${esc(p.host)}</div>

  <div class="card">
    ${row('Degree awarded', p.degree)}
    ${row('Institution', p.host)}
    ${row('Duration', p.funding)}
    ${row('Application deadline', p.deadline, true)}
    ${row('Opens', p.opens)}
    ${row('Status', isClosed ? 'Closed — check back for the next intake' : 'Open / check official page')}
  </div>

  <h2>Admission requirements</h2>
  <div class="req">
      ${paragraphs(p.description)}
  </div>

  <div class="ctas">
    ${cleanField(p.link) ? `<a class="btn gold" href="${esc(p.link)}" rel="nofollow noopener">Official programme page →</a>` : ''}
    <a class="btn line" href="${SITE}/">Browse the live directory →</a>
  </div>

  <p class="note">This page is generated from the BioCommons Ghana directory and refreshed nightly. Always confirm deadlines and requirements on the institution's official page — BioCommons Ghana lists opportunities but is not the admitting institution.</p>
</main>
<footer>BioCommons Ghana · <b>OPEN SCIENCE · OPEN DOORS · OPEN GHANA</b></footer>
</body>
</html>
`;
}

// ── index page ────────────────────────────────────────────────────────────────
function indexPage(items) {
  const byHost = {};
  items.forEach(p => { (byHost[p.shortHost] ||= []).push(p); });
  const groups = Object.keys(byHost).sort().map(host => `
    <h2>${esc(host)}</h2>
    <ul>
      ${byHost[host].map(p => `<li><a href="${SITE}/programmes/${p.slug}/">${esc(p.title)}</a><span>${esc(p.degree || '')}${p.funding ? ' · ' + esc(p.funding) : ''}</span></li>`).join('\n      ')}
    </ul>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Graduate Programmes in Biological Sciences, Ghana (${items.length} listed) | BioCommons Ghana</title>
<meta name="description" content="Browse ${items.length} graduate programmes — MPhil, MSc, PhD — in the biological sciences across Ghanaian universities. Deadlines, durations and admission requirements, freshly curated by BioCommons Ghana."/>
<link rel="canonical" href="${SITE}/programmes/"/>
<meta property="og:title" content="Graduate Programmes in Biological Sciences, Ghana"/>
<meta property="og:image" content="${SITE}/og-image.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@800&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
:root{--paper:#FBF8F1;--dark:#0B2618;--green:#0D7C3E;--gold:#F5A623;--muted:#5C6B5E;--line:rgba(11,38,24,0.12);}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--paper);color:#15140F;line-height:1.6;}
.top{background:var(--dark);padding:14px 5%;}
.top a{color:#FFFEFB;text-decoration:none;font-weight:700;font-size:15px;}
.top a span{color:var(--gold);}
main{max-width:760px;margin:0 auto;padding:44px 5% 70px;}
h1{font-family:'Playfair Display',serif;font-weight:800;font-size:clamp(28px,5vw,44px);line-height:1.08;color:var(--dark);margin-bottom:10px;letter-spacing:-0.015em;}
.sub{font-size:15.5px;color:var(--muted);margin-bottom:38px;max-width:560px;}
h2{font-family:'Playfair Display',serif;font-size:20px;color:var(--green);margin:34px 0 10px;}
ul{list-style:none;}
li{padding:11px 0;border-bottom:1px dashed var(--line);display:flex;justify-content:space-between;gap:16px;align-items:baseline;}
li a{color:var(--dark);font-weight:600;font-size:15px;text-decoration:none;}
li a:hover{color:var(--green);}
li span{font-size:12.5px;color:var(--muted);white-space:nowrap;}
footer{background:var(--dark);color:rgba(255,254,251,0.6);text-align:center;padding:26px 5%;font-size:12.5px;margin-top:60px;}
footer b{color:var(--gold);}
</style>
</head>
<body>
<div class="top"><a href="${SITE}/">BioCommons <span>Ghana</span></a></div>
<main>
  <h1>Graduate Programmes in Biological Sciences, Ghana</h1>
  <p class="sub">${items.length} MPhil, MSc and PhD programmes across Ghanaian universities — with deadlines, durations and admission requirements. Refreshed nightly from the <a href="${SITE}/" style="color:var(--green);">BioCommons Ghana directory</a>.</p>
  ${groups}
</main>
<footer>BioCommons Ghana · <b>OPEN SCIENCE · OPEN DOORS · OPEN GHANA</b></footer>
</body>
</html>
`;
}

// ── sitemap ───────────────────────────────────────────────────────────────────
function sitemap(items) {
  const today = new Date().toISOString().slice(0, 10);
  const url = (loc, lastmod, freq, pri) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  const entries = [
    url(`${SITE}/`, today, 'daily', '1.0'),
    url(`${SITE}/programmes/`, today, 'daily', '0.9'),
    ...items.map(p => url(`${SITE}/programmes/${p.slug}/`,
      p.added ? String(p.added).slice(0, 10) : today, 'weekly', '0.7'))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function fetchProgrammes() {
  if (MOCK) { console.log('• mock mode: using fixtures'); return FIXTURES; }
  const res = await fetch(`${API}?sheet=${encodeURIComponent('Graduate Programs')}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.error || 'unknown'}`);
  return json.data || [];
}

function shortHostOf(host) {
  // "WACCBIP, University of Ghana" → group under the institution (last segment)
  const parts = String(host || '').split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Other institutions';
}

const raw = await fetchProgrammes();
const items = [];
const seen = new Map();

for (const r of raw) {
  const title = cleanField(r.title);
  const host  = cleanField(r.host);
  if (!title || !host) continue;   // a page needs at least a name and a school
  const p = {
    title, host,
    shortHost: shortHostOf(host),
    degree:   cleanField(r.degree),
    funding:  cleanField(r.funding),
    deadline: cleanField(r.deadline),
    opens:    cleanField(r.opens),
    closed:   cleanField(r.closed),
    link:     cleanField(r.link),
    description: r.description || '',
    added:    r.added || ''
  };
  let slug = slugify(`${p.title} ${p.shortHost}`);
  const n = (seen.get(slug) || 0) + 1;
  seen.set(slug, n);
  if (n > 1) slug = `${slug}-${n}`;
  p.slug = slug;
  items.push(p);
}

if (items.length === 0) {
  console.error('✗ No programmes with usable data — refusing to wipe existing pages.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const p of items) {
  await mkdir(join(OUT, p.slug), { recursive: true });
  await writeFile(join(OUT, p.slug, 'index.html'), programmePage(p));
}
await writeFile(join(OUT, 'index.html'), indexPage(items));
await writeFile('sitemap.xml', sitemap(items));

console.log(`✓ Generated ${items.length} programme pages, the index, and sitemap.xml (${items.length + 2} URLs).`);
