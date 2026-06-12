/* global chrome */

let businesses = [];
let autoScrapeProgress = null;

function norm(s) { return (s || '').toString().replace(/\s+/g, ' ').trim(); }

function upsert(incoming) {
  const map = new Map();
  for (const b of businesses) {
    const key = b.id || b.name?.toLowerCase();
    if (key) map.set(key, b);
  }
  for (const b of incoming) {
    const key = b.id || norm(b.name)?.toLowerCase();
    if (!key) continue;
    if (map.has(key)) {
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        name:     prev.name     || b.name,
        address:  prev.address  || b.address,
        phone:    prev.phone    || b.phone,
        website:  prev.website  || b.website,
        mapsLink: prev.mapsLink || b.mapsLink,
        socials:  Object.assign({}, prev.socials || {}, b.socials || {}),
      });
    } else {
      map.set(key, b);
    }
  }
  businesses = Array.from(map.values());
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SOCIAL_META = {
  facebook:  { label: 'Facebook',   color: '#1877f2' },
  instagram: { label: 'Instagram',  color: '#e1306c' },
  tiktok:    { label: 'TikTok',     color: '#010101' },
  twitter:   { label: 'Twitter/X',  color: '#1da1f2' },
  youtube:   { label: 'YouTube',    color: '#ff0000' },
  linkedin:  { label: 'LinkedIn',   color: '#0a66c2' },
};

function buildHtml() {
  const cards = businesses.map((b, i) => {
    const cardId = `c${i}`;
    const s = b.socials || {};
    const socialLinks = Object.entries(SOCIAL_META)
      .filter(([k]) => s[k])
      .map(([k, m]) => `<a class="social-chip" href="${esc(s[k])}" target="_blank" rel="noopener"
        style="background:${m.color}">${m.label}</a>`)
      .join('');

    const phoneHtml   = b.phone   ? `<a class="action-btn phone-btn" href="tel:${esc(b.phone)}">📞 ${esc(b.phone)}</a>` : '';
    const websiteHtml = b.website ? `<a class="action-btn web-btn" href="${esc(b.website)}" target="_blank" rel="noopener">🌐 Website</a>` : '';
    const mapsHtml    = b.mapsLink ? `<a class="action-btn maps-btn" href="${esc(b.mapsLink)}" target="_blank" rel="noopener">📍 Maps</a>` : '';

    return `<div class="card" id="${cardId}">
  <div class="card-header">
    <div class="card-name">${esc(b.name || '(No name)')}</div>
    <button class="btn-tick" onclick="toggle('${cardId}')" title="Mark as contacted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
  </div>
  ${b.address ? `<div class="card-address">📍 ${esc(b.address)}</div>` : ''}
  ${(phoneHtml || websiteHtml || mapsHtml) ? `<div class="action-row">${phoneHtml}${websiteHtml}${mapsHtml}</div>` : ''}
  ${socialLinks ? `<div class="social-row">${socialLinks}</div>` : ''}
</div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Maps Export</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f0f2f5;color:#1a1a1a;font-size:15px}

  /* ── topbar ── */
  .topbar{position:sticky;top:0;z-index:100;background:#1a73e8;color:#fff;
    padding:12px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
    box-shadow:0 2px 10px rgba(0,0,0,.25)}
  .topbar h1{font-size:16px;font-weight:700;flex:1;min-width:120px}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap}
  .chip-grey{background:rgba(255,255,255,.2)}
  .chip-green{background:#22c55e;color:#052e16}
  .chip-red{background:#ef4444;color:#fff}

  /* ── filters ── */
  .filter-bar{display:flex;gap:6px;padding:12px 16px 4px;flex-wrap:wrap}
  .filter-btn{padding:7px 16px;border-radius:20px;border:1.5px solid #d1d5db;background:#fff;
    font-size:13px;font-weight:600;cursor:pointer;color:#374151;transition:all .15s;white-space:nowrap}
  .filter-btn.active{background:#1a73e8;color:#fff;border-color:#1a73e8}
  .filter-btn:active{transform:scale(.96)}

  /* ── list ── */
  .list{padding:8px 16px 40px;max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:10px}

  /* ── card ── */
  .card{background:#fff;border-radius:14px;padding:14px 14px 12px;
    box-shadow:0 1px 3px rgba(0,0,0,.09);border-left:4px solid #1a73e8;transition:all .25s}
  .card.done{border-left-color:#4ade80;background:#f0fdf4;opacity:.8}
  .card-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;line-height:1.3;flex:1}
  .card-address{font-size:12px;color:#666;margin-bottom:8px;line-height:1.4}

  /* ── action buttons ── */
  .action-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}
  .action-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;
    border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;
    white-space:nowrap;transition:filter .15s}
  .action-btn:hover{filter:brightness(.92)}
  .phone-btn{background:#dcfce7;color:#166534}
  .web-btn  {background:#dbeafe;color:#1e40af}
  .maps-btn {background:#fef3c7;color:#92400e}

  /* ── social chips ── */
  .social-row{display:flex;gap:5px;flex-wrap:wrap}
  .social-chip{display:inline-block;padding:3px 10px;border-radius:20px;
    font-size:11px;font-weight:700;color:#fff;text-decoration:none;transition:opacity .15s}
  .social-chip:hover{opacity:.82}

  /* ── tick button ── */
  .btn-tick{background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:10px;
    padding:6px 8px;cursor:pointer;display:flex;align-items:center;color:#64748b;
    flex-shrink:0;transition:all .15s;min-width:36px;min-height:36px;justify-content:center}
  .btn-tick:hover{background:#dcfce7;border-color:#86efac;color:#16a34a}
  .card.done .btn-tick{background:#bbf7d0;border-color:#4ade80;color:#15803d}

  @media(max-width:480px){
    .topbar h1{font-size:14px}
    .action-btn{font-size:12px;padding:6px 11px}
    .card-name{font-size:14px}
    .list{padding:8px 10px 40px}
  }
</style>
</head>
<body>
<div class="topbar">
  <h1>📍 Google Maps Export</h1>
  <div class="chips">
    <span class="chip chip-grey" id="stat-total">${businesses.length} total</span>
    <span class="chip chip-green" id="stat-done">0 contacted</span>
    <span class="chip chip-red" id="stat-left">${businesses.length} left</span>
  </div>
</div>
<div class="filter-bar">
  <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
  <button class="filter-btn" onclick="setFilter('todo',this)">Not Contacted</button>
  <button class="filter-btn" onclick="setFilter('done',this)">Contacted ✓</button>
</div>
<div class="list" id="list">
${cards}
</div>
<script>
var KEY='gme_export',curFilter='all';
var contacted=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
function save(){localStorage.setItem(KEY,JSON.stringify(Array.from(contacted)))}
function stats(){
  var d=contacted.size,t=document.querySelectorAll('.card').length;
  document.getElementById('stat-done').textContent=d+' contacted';
  document.getElementById('stat-left').textContent=(t-d)+' left';
}
function toggle(id){
  var card=document.getElementById(id);
  if(contacted.has(id)){contacted.delete(id);card.classList.remove('done')}
  else{contacted.add(id);card.classList.add('done')}
  save();stats();applyFilter();
}
function setFilter(f,btn){
  curFilter=f;
  document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  applyFilter();
}
function applyFilter(){
  document.querySelectorAll('.card').forEach(function(card){
    var done=card.classList.contains('done');
    card.style.display=(curFilter==='all'||(curFilter==='done'&&done)||(curFilter==='todo'&&!done))?'':'none';
  });
}
(function init(){
  contacted.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add('done')});
  stats();
})();
</script>
</body>
</html>`;
}

function buildCsv() {
  const cols = ['Name','Phone','Website','Address','Maps Link','Facebook','Instagram','TikTok','Twitter/X','YouTube','LinkedIn'];
  const header = cols.join(',');
  const csvRow = b => {
    const s = b.socials || {};
    const vals = [b.name, b.phone, b.website, b.address, b.mapsLink,
      s.facebook, s.instagram, s.tiktok, s.twitter, s.youtube, s.linkedin];
    return vals.map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(',');
  };
  return [header, ...businesses.map(csvRow)].join('\r\n');
}

function downloadText(content, filename, mime) {
  const b64 = btoa(Array.from(new TextEncoder().encode(content), b => String.fromCharCode(b)).join(''));
  const url  = `data:${mime};base64,${b64}`;
  chrome.downloads.download({ url, filename, saveAs: false });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.type) return;

  if (msg.type === 'ADD_BUSINESSES') {
    if (Array.isArray(msg.businesses) && msg.businesses.length) upsert(msg.businesses);
    sendResponse({ ok: true, count: businesses.length });
    return true;
  }

  if (msg.type === 'AUTO_SCRAPE_PROGRESS') {
    autoScrapeProgress = { done: msg.done, total: msg.total, current: msg.current, status: msg.status };
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_STATE') {
    sendResponse({ ok: true, count: businesses.length, businesses, autoScrapeProgress });
    return true;
  }

  if (msg.type === 'CLEAR') {
    businesses = [];
    autoScrapeProgress = null;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'EXPORT_HTML') {
    if (!businesses.length) { sendResponse({ ok: false, error: 'No data' }); return true; }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `maps_export_${ts}.html`;
    try {
      downloadText(buildHtml(), filename, 'text/html');
      sendResponse({ ok: true, filename });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  if (msg.type === 'EXPORT_CSV') {
    if (!businesses.length) { sendResponse({ ok: false, error: 'No data' }); return true; }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `maps_export_${ts}.csv`;
    try {
      downloadText(buildCsv(), filename, 'text/csv');
      sendResponse({ ok: true, filename });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
});
