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

function buildHtml() {
  const rows = businesses.map((b, i) => {
    const phone   = b.phone   ? `<div class="detail">📞 <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>` : '';
    const website = b.website ? `<div class="detail">🌐 <a href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website)}</a></div>` : '';
    const address = b.address ? `<div class="detail">📍 ${esc(b.address)}</div>` : '';
    const maps    = b.mapsLink ? `<div class="detail"><a href="${esc(b.mapsLink)}" target="_blank" rel="noopener">View on Google Maps</a></div>` : '';
    return `<div class="card" id="card${i}">
      <div class="card-name">${esc(b.name || '(No name)')}</div>
      ${phone}${website}${address}${maps}
    </div>`;
  }).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Google Maps Scrape Results</title>
<style>
  body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #f9f9f9; }
  h1 { font-size: 22px; margin-bottom: 20px; color: #1a73e8; }
  .card { background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  .card-name { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
  .detail { font-size: 13px; color: #555; margin-top: 4px; }
  a { color: #1a73e8; }
</style>
</head>
<body>
<h1>Google Maps Businesses (${businesses.length})</h1>
${rows}
</body>
</html>`;
}

function buildCsv() {
  const cols = ['Name','Phone','Website','Address','Maps Link'];
  const header = cols.join(',');
  const csvRow = b => cols.map((_, i) => {
    const val = [b.name, b.phone, b.website, b.address, b.mapsLink][i] || '';
    return '"' + String(val).replace(/"/g, '""') + '"';
  }).join(',');
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
