/* global chrome */

function norm(s) { return (s || '').toString().replace(/\s+/g, ' ').trim(); }

const UI_NOISE = new Set([
  'results','directions','hotels','things to do','restaurants','gas stations',
  'pharmacies','parking','transit','back','close','more','nearby','explore'
]);
function isRealName(n) {
  return !(!n || n.length < 2 || n.length > 120 ||
    UI_NOISE.has(n.toLowerCase()) || /^[\d\s.,\-]+$/.test(n));
}

function placeKeyFromUrl(url) {
  try {
    const m = (url || '').match(/\/maps\/place\/([^/@?]+)/);
    if (m) return decodeURIComponent(m[1]).toLowerCase().replace(/\+/g, ' ').trim();
  } catch (_) {}
  return '';
}

function collectListings() {
  const seen = new Set(), results = [];
  for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
    const rect = a.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) continue;
    const name = norm(a.getAttribute('aria-label') || '');
    if (!name || !isRealName(name)) continue;
    const key = placeKeyFromUrl(a.href) || name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push({ id: key, name, address: '', phone: '', website: '', mapsLink: a.href, socials: {} });
  }
  return results;
}

let seenIds = new Set();
function sendUpdate(items) {
  try { chrome.runtime.sendMessage({ type: 'ADD_BUSINESSES', businesses: items }); } catch (_) {}
}

function tryExtractAndSend() {
  const fresh = collectListings().filter(x => {
    if (!x.id || seenIds.has(x.id)) return false;
    seenIds.add(x.id); return true;
  });
  if (fresh.length > 0) sendUpdate(fresh);
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg?.type === 'SCRAPE_NOW') {
    seenIds = new Set();
    setTimeout(() => {
      const l = collectListings();
      if (l.length) sendUpdate(l);
      sendResponse({ ok: true, count: l.length });
    }, 300);
    return true;
  }
});

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(tryExtractAndSend, 600);
});
observer.observe(document.documentElement, { subtree: true, childList: true });
tryExtractAndSend();
