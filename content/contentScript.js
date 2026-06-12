/* global chrome */

function norm(s) { return (s || '').toString().replace(/\s+/g, ' ').trim(); }

function unwrapUrl(href) {
  try {
    const u = new URL(href);
    if (/google\./i.test(u.hostname)) {
      // handles /url?q=, /maps/url?q=, /search?q=, etc.
      const q = u.searchParams.get('q') || u.searchParams.get('url');
      if (q && /^https?:\/\//i.test(q)) return q;
    }
  } catch (_) {}
  return href;
}

const UI_NOISE = new Set([
  'results','directions','hotels','things to do','restaurants','gas stations',
  'pharmacies','parking','transit','back','close','more','nearby','explore',
  'send to your phone','add a label','suggest an edit','share','save'
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
  // Try multiple selectors Google Maps uses
  const selectors = [
    '[data-item-id="address"]',
    '[data-tooltip="Copy address"]',
    'button[data-item-id*="address"]',
  ];
  for (const sel of selectors) {
    const el = (scope || document).querySelector(sel);
    if (el) {
      const text = norm(el.getAttribute('aria-label') || el.textContent || '');
      if (text && text.length > 3) return text.replace(/^address:\s*/i, '');
    }
  }
  return '';
}

function extractPhone(scope) {
  const root = scope || document.body;

  // 1. Standard tel: anchor link
  const tel = root.querySelector('a[href^="tel:"]');
  if (tel) return decodeURIComponent(tel.href).replace(/^tel:/i, '').trim();

  // 2. data-item-id^="phone:tel:" — number embedded in attribute
  const phoneAttr = root.querySelector('[data-item-id^="phone:tel:"]');
  if (phoneAttr) {
    try {
      const raw = decodeURIComponent(
        phoneAttr.getAttribute('data-item-id').replace(/^phone:tel:/i, '')
      ).trim();
      if (raw && /\d{4,}/.test(raw)) return raw;
    } catch (_) {}
    // fallback: read text inside the button
    const inner = norm(phoneAttr.textContent || '');
    const m = inner.match(/(\+?[\d][\d\s().‑\-]{5,}[\d])/);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 3. aria-label containing "Phone:" or "Call:"
  for (const node of root.querySelectorAll('[aria-label]')) {
    const label = norm(node.getAttribute('aria-label') || '');
    const m = label.match(/(?:phone|call|tel)[:\s]+(\+?[\d][\d\s().‑\-]{5,}[\d])/i);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 4. Any button/element whose aria-label IS a phone number
  for (const node of root.querySelectorAll('[aria-label]')) {
    const label = norm(node.getAttribute('aria-label') || '');
    if (/^(\+?[\d][\d\s().‑\-]{5,}[\d])$/.test(label)) {
      const digits = label.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) return label;
    }
  }

  // 5. Leaf-element text scan — Maps desktop sometimes renders bare number text
  for (const node of root.querySelectorAll('*')) {
    if (node.children.length > 0) continue;
    const text = (node.textContent || '').trim();
    if (/^(\+?[\d][\d\s().‑\-]{5,}[\d])$/.test(text)) {
      const digits = text.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) return text;
    }
  }

  return '';
}

function extractWebsite(scope) {
  const root = scope || document.body;

  // 1. data-item-id="authority" — the standard website button
  const authority = root.querySelector('[data-item-id="authority"]');
  if (authority) {
    const a = authority.tagName === 'A' ? authority : authority.querySelector('a[href]');
    if (a && a.href) return unwrapUrl(a.href);
    if (authority.getAttribute('href')) return unwrapUrl(authority.getAttribute('href'));
    // aria-label fallback
    const label = authority.getAttribute('aria-label') || '';
    const m = label.match(/https?:\/\/[^\s]+/);
    if (m) return m[0];
  }

  // 2. Any element with data-item-id containing "web" or "url"
  for (const sel of ['[data-item-id*="web"]', '[data-item-id*="url"]', '[data-item-id*="site"]']) {
    const el = root.querySelector(sel);
    if (el) {
      const a = el.tagName === 'A' ? el : el.querySelector('a[href]');
      if (a && a.href && !/maps\.google|google\.com\/maps/i.test(a.href)) return unwrapUrl(a.href);
    }
  }

  // 3. aria-label "Website" button
  for (const node of root.querySelectorAll('[aria-label]')) {
    const label = (node.getAttribute('aria-label') || '').toLowerCase();
    if (label === 'website' || label.startsWith('open website') || label.startsWith('visit website')) {
      const a = node.tagName === 'A' ? node : node.querySelector('a[href]');
      if (a && a.href) return unwrapUrl(a.href);
    }
  }

  // 4. Any Google redirect link (google.com/url?q=...) in the detail panel — these are always website links
  for (const a of root.querySelectorAll('a[href*="/url?q="], a[href*="maps/url?"]')) {
    const unwrapped = unwrapUrl(a.href);
    if (unwrapped !== a.href) return unwrapped; // only return if we successfully unwrapped
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
    results.push({ id: key, name, address: '', phone: '', website: '', mapsLink: a.href, socials: {} });
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
    mapsLink: window.location.href.split('?')[0], // clean URL
    socials:  extractSocials(scope),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForDetailLoaded(timeout = 12000) {
  return new Promise(resolve => {
    const start = Date.now();
    let h1SeenAt = 0;
    function check() {
      // If we navigated away from the detail page, stop
      if (!window.location.href.includes('/maps/place')) { resolve(false); return; }
      const elapsed = Date.now() - start;
      if (elapsed > timeout) { resolve(true); return; }

      const h1 = document.querySelector('[role="main"] h1') || document.querySelector('h1');
      if (!h1 || norm(h1.textContent).length < 2) {
        setTimeout(check, 300); return;
      }
      if (!h1SeenAt) h1SeenAt = Date.now();

      // Once h1 is visible, wait for contact info OR up to 5 seconds
      const hasPhone = document.querySelector('[data-item-id^="phone:tel:"]')
        || document.querySelector('a[href^="tel:"]');
      const hasWebsite = document.querySelector('[data-item-id="authority"]')
        || document.querySelector('a[href*="/url?q="]');
      const sinceH1 = Date.now() - h1SeenAt;

      if (hasPhone || hasWebsite || sinceH1 > 5000) { resolve(true); return; }
      setTimeout(check, 350);
    }
    check();
  });
}

function waitForListView(timeout = 7000) {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      if (window.location.href.includes('/maps/place')) {
        if (Date.now() - start > timeout) { resolve(false); return; }
        setTimeout(check, 250); return;
      }
      const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
      if (anchors.length > 0) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 250);
    }
    check();
  });
}

function sendProgress(done, total, current, status) {
  try { chrome.runtime.sendMessage({ type: 'AUTO_SCRAPE_PROGRESS', done, total, current, status }); } catch (_) {}
}

let autoScraping = false;

async function runAutoScrape() {
  if (autoScraping) return { error: 'already_running' };
  autoScraping = true;

  const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).filter(a => {
    const rect = a.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return false;
    const name = norm(a.getAttribute('aria-label') || '');
    return name && isRealName(name);
  });

  // Remove duplicates by place key
  const seen = new Set();
  const targets = anchors.filter(a => {
    const key = placeKeyFromUrl(a.href) || norm(a.getAttribute('aria-label') || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const total = targets.length;
  let done = 0;
  const results = [];

  for (const anchor of targets) {
    if (!autoScraping) break;
    const name = norm(anchor.getAttribute('aria-label') || '');
    sendProgress(done, total, name, 'scraping');

    // Click the anchor and wait for navigation
    anchor.click();
    await sleep(600);

    const loaded = await waitForDetailLoaded(12000);

    if (loaded) {
      // Extra pause to let contact info render after h1 appears
      await sleep(1200);
      const detail = extractDetailPanel();
      if (detail) {
        results.push(detail);
        try { chrome.runtime.sendMessage({ type: 'ADD_BUSINESSES', businesses: [detail] }); } catch (_) {}
      }
    }

    history.back();
    await waitForListView(7000);
    await sleep(600);
    done++;
    sendProgress(done, total, name, 'scraping');
  }

  sendProgress(done, total, '', 'done');
  autoScraping = false;
  return { ok: true, done: results.length };
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
  if (msg?.type === 'PING') {
    sendResponse({ pong: true });
    return;
  }
  if (msg?.type === 'SCRAPE_NOW') {
    seenIds = new Set();
    setTimeout(() => {
      const l = collectListings();
      if (l.length) sendUpdate(l);
      sendResponse({ ok: true, count: l.length });
    }, 300);
    return true;
  }
  if (msg?.type === 'AUTO_SCRAPE') {
    runAutoScrape().then(sendResponse);
    return true;
  }
  if (msg?.type === 'STOP_AUTO_SCRAPE') {
    autoScraping = false;
    sendResponse({ ok: true });
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
