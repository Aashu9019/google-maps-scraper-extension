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
  const ts = new Date().toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });

  const cards = businesses.map((b, i) => {
    const cardId = `c${i}`;
    const s = b.socials || {};

    const socialChips = Object.entries(SOCIAL_META)
      .filter(([k]) => s[k])
      .map(([k, m]) =>
        `<a class="schip" href="${esc(s[k])}" target="_blank" rel="noopener" style="background:${m.color}">${m.label}</a>`)
      .join('');

    const phoneBtn = b.phone
      ? `<a class="abtn call" href="tel:${esc(b.phone)}">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
           ${esc(b.phone)}
         </a>` : '';

    const webBtn = b.website
      ? `<a class="abtn web" href="${esc(b.website)}" target="_blank" rel="noopener">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
           Visit Website
         </a>` : '';

    const mapsBtn = b.mapsLink
      ? `<a class="abtn maps" href="${esc(b.mapsLink)}" target="_blank" rel="noopener">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
           Open Maps
         </a>` : '';

    const noData = !b.phone && !b.website ? `<div class="no-data">No phone or website found</div>` : '';

    return `<div class="card" id="${cardId}">
  <div class="card-top">
    <div>
      <div class="biz-num">#${i + 1}</div>
      <div class="biz-name">${esc(b.name || '(No name)')}</div>
      ${b.address ? `<div class="biz-addr">${esc(b.address)}</div>` : ''}
    </div>
    <button class="tick" onclick="toggle('${cardId}')" title="Mark as contacted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="20" height="20">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="8 12 11 15 16 9"/>
      </svg>
      <span class="tick-label">Done</span>
    </button>
  </div>
  ${noData}
  ${(phoneBtn || webBtn || mapsBtn) ? `<div class="btns">${phoneBtn}${webBtn}${mapsBtn}</div>` : ''}
  ${socialChips ? `<div class="socials">${socialChips}</div>` : ''}
</div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maps Export — ${ts}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#eef1f7;color:#111;min-height:100vh}

/* ──── header ──── */
.hdr{background:linear-gradient(135deg,#1557d4 0%,#1a73e8 100%);color:#fff;
  padding:16px 20px 14px;position:sticky;top:0;z-index:200;
  box-shadow:0 3px 12px rgba(0,0,0,.22)}
.hdr-row1{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.hdr-icon{width:36px;height:36px;background:rgba(255,255,255,.18);border-radius:10px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hdr-title{font-size:16px;font-weight:800;letter-spacing:-.2px}
.hdr-sub{font-size:11px;opacity:.75;margin-top:1px}
.stats{display:flex;gap:8px;flex-wrap:wrap}
.stat{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:700}
.stat-all{background:rgba(255,255,255,.2)}
.stat-done{background:#22c55e;color:#052e16}
.stat-left{background:#f87171;color:#7f1d1d}

/* ──── filter bar ──── */
.fbar{display:flex;gap:8px;padding:14px 20px 8px;flex-wrap:wrap;background:#fff;
  border-bottom:1px solid #e5e7eb}
.fb{padding:7px 18px;border-radius:20px;border:1.5px solid #d1d5db;background:#f9fafb;
  font-size:13px;font-weight:600;cursor:pointer;color:#374151;transition:all .15s}
.fb.on{background:#1a73e8;color:#fff;border-color:#1a73e8;box-shadow:0 2px 6px rgba(26,115,232,.35)}
.fb:active{transform:scale(.96)}

/* ──── list ──── */
.lst{max-width:700px;margin:0 auto;padding:16px 16px 60px;display:flex;flex-direction:column;gap:12px}

/* ──── card ──── */
.card{background:#fff;border-radius:16px;overflow:hidden;
  box-shadow:0 1px 4px rgba(0,0,0,.1),0 4px 16px rgba(0,0,0,.05);
  border-left:5px solid #1a73e8;transition:all .22s}
.card.done{border-left-color:#22c55e;background:#f0fdf4}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;
  gap:10px;padding:14px 14px 10px}
.biz-num{font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.5px;margin-bottom:2px;text-transform:uppercase}
.biz-name{font-size:16px;font-weight:800;line-height:1.25;color:#111;margin-bottom:4px}
.biz-addr{font-size:12px;color:#6b7280;line-height:1.4}
.no-data{font-size:12px;color:#9ca3af;font-style:italic;padding:0 14px 10px}

/* ──── tick button ──── */
.tick{background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:12px;
  padding:8px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;
  gap:3px;color:#6b7280;flex-shrink:0;transition:all .18s;min-width:52px}
.tick:hover{background:#dcfce7;border-color:#86efac;color:#16a34a}
.tick-label{font-size:10px;font-weight:700;letter-spacing:.3px}
.card.done .tick{background:#bbf7d0;border-color:#4ade80;color:#15803d}

/* ──── action buttons ──── */
.btns{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 12px}
.abtn{display:inline-flex;align-items:center;gap:6px;padding:9px 15px;
  border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;
  white-space:nowrap;transition:filter .15s,transform .1s;letter-spacing:-.1px}
.abtn:hover{filter:brightness(.93)}
.abtn:active{transform:scale(.97)}
.call{background:#dcfce7;color:#15803d;border:1.5px solid #bbf7d0}
.web {background:#dbeafe;color:#1d4ed8;border:1.5px solid #bfdbfe}
.maps{background:#fef9c3;color:#854d0e;border:1.5px solid #fde68a}

/* ──── social ──── */
.socials{display:flex;gap:5px;flex-wrap:wrap;padding:0 14px 12px}
.schip{display:inline-block;padding:4px 11px;border-radius:20px;
  font-size:11px;font-weight:700;color:#fff;text-decoration:none;opacity:.92}
.schip:hover{opacity:1}

/* ──── responsive ──── */
@media(max-width:500px){
  .hdr{padding:12px 14px 12px}
  .fbar{padding:10px 14px 6px;gap:6px}
  .fb{padding:6px 14px;font-size:12px}
  .lst{padding:12px 10px 50px;gap:10px}
  .biz-name{font-size:15px}
  .abtn{font-size:12px;padding:8px 12px}
  .btns{gap:6px}
}
</style>
</head>
<body>
<div class="hdr">
  <div class="hdr-row1">
    <div class="hdr-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
    </div>
    <div>
      <div class="hdr-title">Google Maps Export</div>
      <div class="hdr-sub">Exported ${ts} &nbsp;·&nbsp; ${businesses.length} businesses</div>
    </div>
  </div>
  <div class="stats">
    <span class="stat stat-all" id="s-total">${businesses.length} total</span>
    <span class="stat stat-done" id="s-done">0 contacted</span>
    <span class="stat stat-left" id="s-left">${businesses.length} remaining</span>
  </div>
</div>
<div class="fbar">
  <button class="fb on" onclick="setF('all',this)">All (${businesses.length})</button>
  <button class="fb" onclick="setF('todo',this)">To Contact</button>
  <button class="fb" onclick="setF('done',this)">Contacted ✓</button>
</div>
<div class="lst" id="lst">${cards}</div>
<script>
var K='gme_v2',f='all';
var C=new Set(JSON.parse(localStorage.getItem(K)||'[]'));
function save(){localStorage.setItem(K,JSON.stringify([...C]))}
function stats(){
  var d=C.size,t=document.querySelectorAll('.card').length;
  document.getElementById('s-done').textContent=d+' contacted';
  document.getElementById('s-left').textContent=(t-d)+' remaining';
}
function toggle(id){
  var el=document.getElementById(id);
  C.has(id)?(C.delete(id),el.classList.remove('done')):(C.add(id),el.classList.add('done'));
  save();stats();applyF();
}
function setF(v,btn){
  f=v;
  document.querySelectorAll('.fb').forEach(function(b){b.classList.remove('on')});
  btn.classList.add('on');
  applyF();
}
function applyF(){
  document.querySelectorAll('.card').forEach(function(c){
    var d=c.classList.contains('done');
    c.style.display=(f==='all'||(f==='done'&&d)||(f==='todo'&&!d))?'':'none';
  });
}
(function(){C.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add('done')});stats()})();
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
