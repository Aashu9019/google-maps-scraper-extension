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
});
