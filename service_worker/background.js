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
      .map(([k, m]) => `<a href="${esc(s[k])}" target="_blank" rel="noopener"
        style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
               background:${m.color};color:#fff;text-decoration:none;margin:2px">${m.label}</a>`)
      .join('');

    return `<div class="card" id="${cardId}">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
    <div class="card-name">${esc(b.name || '(No name)')}</div>
    <button class="btn-tick" onclick="toggle('${cardId}')" title="Mark as contacted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </button>
  </div>
  ${b.phone   ? `<div class="detail">📞 <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>` : ''}
  ${b.website ? `<div class="detail">🌐 <a href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website)}</a></div>` : ''}
  ${b.address ? `<div class="detail">📍 ${esc(b.address)}</div>` : ''}
  ${b.mapsLink ? `<div class="detail"><a href="${esc(b.mapsLink)}" target="_blank" rel="noopener">View on Google Maps ↗</a></div>` : ''}
  ${socialLinks ? `<div style="margin-top:8px">${socialLinks}</div>` : ''}
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
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;color:#202124}
  .topbar{position:sticky;top:0;z-index:100;background:#1a73e8;color:#fff;padding:12px 20px;
    display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .topbar h1{font-size:17px;font-weight:700;flex:1}
  .chip{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(255,255,255,.18)}
  .chip.green{background:#34d399;color:#064e3b}
  .chip.red{background:#f87171;color:#7f1d1d}
  .filters{display:flex;gap:7px;margin:14px 20px 0}
  .filter-btn{padding:6px 16px;border-radius:20px;border:1.5px solid #d1d5db;background:#fff;
    font-size:12px;font-weight:600;cursor:pointer;color:#374151;transition:all .15s}
  .filter-btn.active{background:#1a73e8;color:#fff;border-color:#1a73e8}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;
    padding:16px 20px 30px;max-width:1400px;margin:0 auto}
  .card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);
    border-left:4px solid #1a73e8;transition:all .2s}
  .card.done{border-left-color:#6ee7b7;background:#f0fdf4;opacity:.75}
  .card-name{font-size:15px;font-weight:700;margin-bottom:8px;line-height:1.3}
  .detail{font-size:13px;color:#555;margin-top:5px}
  .detail a{color:#1a73e8;text-decoration:none}
  .detail a:hover{text-decoration:underline}
  .btn-tick{background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:8px;
    padding:5px 7px;cursor:pointer;display:flex;align-items:center;color:#64748b;
    flex-shrink:0;transition:all .15s}
  .btn-tick:hover{background:#dcfce7;border-color:#86efac;color:#16a34a}
  .card.done .btn-tick{background:#dcfce7;border-color:#6ee7b7;color:#16a34a}
</style>
</head>
<body>
<div class="topbar">
  <h1>📍 Google Maps Export</h1>
  <span class="chip" id="stat-total">${businesses.length} total</span>
  <span class="chip green" id="stat-done">0 contacted</span>
  <span class="chip red" id="stat-left">${businesses.length} left</span>
</div>
<div class="filters">
  <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
  <button class="filter-btn" onclick="setFilter('todo',this)">Not Contacted</button>
  <button class="filter-btn" onclick="setFilter('done',this)">Contacted ✓</button>
</div>
<div class="grid" id="grid">
${cards}
</div>
<script>
var KEY='gme_export',curFilter='all';
var contacted=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
function save(){localStorage.setItem(KEY,JSON.stringify(Array.from(contacted)))}
function stats(){
  var d=contacted.size,t=document.querySelectorAll('.card').length;
  document.getElementById('stat-done').textContent=d+' contacted';
  document.getElementById('stat-left').textContent+(t-d)+' left';
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
  contacted.forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.classList.add('done');
  });
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
