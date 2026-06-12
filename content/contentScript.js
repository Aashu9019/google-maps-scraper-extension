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

const SOCIAL_PATTERNS = {
  facebook:  /facebook\.com\//i,
  instagram: /instagram\.com\//i,
  tiktok:    /tiktok\.com\//i,
  twitter:   /(twitter\.com\/|x\.com\/)/i,
  youtube:   /youtube\.com\//i,
  linkedin:  /linkedin\.com\//i,
};

function extractSocials(scope) {
  const socials = {};
  for (const a of (scope || document.body).querySelectorAll('a[href]')) {
    const href = (a.href || '').trim();
    for (const [key, pattern] of Object.entries(SOCIAL_PATTERNS)) {
      if (!socials[key] && pattern.test(href)) socials[key] = href;
    }
  }
  return socials;
}

function isOnDetailPage() {
  return window.location.href.includes('/maps/place');
}

function extractAddress(scope) {
  const el = (scope || document).querySelector('[data-item-id="address"]')
    || (scope || document).querySelector('[data-tooltip="Copy address"]');
  if (el) return norm(el.getAttribute('aria-label') || el.textContent);
  return '';
}

function extractPhone(scope) {
  const phoneItem = (scope || document.body).querySelector('[data-item-id^="phone:tel:"]');
  if (phoneItem) {
    try {
      const raw = decodeURIComponent(phoneItem.getAttribute('data-item-id').replace(/^phone:tel:/i, '')).trim();
      if (raw && /\d{4,}/.test(raw)) return raw;
    } catch (_) {}
    const inner = norm(phoneItem.textContent || '');
    const m = inner.match(/(\+?[\d][\d\s().‑\-]{5,}[\d])/);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }
  return '';
}

function extractWebsite(scope) {
  const el = (scope || document.body).querySelector('[data-item-id="authority"]');
  if (el) {
    const a = el.querySelector('a[href]') || (el.tagName === 'A' ? el : null);
    if (a) return a.href;
    const href = el.getAttribute('href');
    if (href) return href;
  }
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
    const socials = isOnDetailPage() ? extractSocials(document.body) : {};
    results.push({ id: key, name, address: '', phone: '', website: '', mapsLink: a.href, socials });
  }
  return results;
}

function extractDetailPanel() {
  if (!isOnDetailPage()) return null;
  const main = document.querySelector('[role="main"]');
  const h1 = main?.querySelector('h1') || document.querySelector('h1');
  if (!h1) return null;
  const name = norm(h1.textContent);
  if (!name || !isRealName(name)) return null;
  const key = placeKeyFromUrl(window.location.href) || name.toLowerCase();
  const scope = document.body;
  return {
    id: key, name,
    address:  extractAddress(main || scope),
    phone:    extractPhone(scope),
    website:  extractWebsite(scope),
    mapsLink: window.location.href,
    socials:  extractSocials(scope),
  };
}

let seenIds = new Set();
function sendUpdate(items) {
  try { chrome.runtime.sendMessage({ type: 'ADD_BUSINESSES', businesses: items }); } catch (_) {}
}

function tryExtractAndSend() {
  const detail = extractDetailPanel();
  if (detail) {
    if (!seenIds.has(detail.id)) { seenIds.add(detail.id); sendUpdate([detail]); }
    return;
  }
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
