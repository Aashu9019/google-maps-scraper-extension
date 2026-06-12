/* global chrome */

function norm(s) { return (s || '').toString().replace(/\s+/g, ' ').trim(); }

function unwrapUrl(href) {
  try {
    const u = new URL(href);
    if (/google\./i.test(u.hostname)) {
      const q = u.searchParams.get('q') || u.searchParams.get('url');
      if (q && /^https?:\/\//i.test(q)) return q;
    }
  } catch (_) {}
  return href;
}

const UI_NOISE = new Set([
  'results','directions','hotels','things to do','restaurants','gas stations',
  'pharmacies','parking','transit','back','close','more','nearby','explore',
  'send to your phone','add a label','suggest an edit','share','save',
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

function extractAddress(main) {
  const selectors = [
    '[data-item-id="address"]',
    '[data-tooltip="Copy address"]',
    'button[data-item-id*="address"]',
  ];
  for (const sel of selectors) {
    const el = (main || document.body).querySelector(sel);
    if (el) {
      const text = norm(el.getAttribute('aria-label') || el.textContent || '');
      if (text && text.length > 3) return text.replace(/^address[:\s]*/i, '').trim();
    }
  }
  return '';
}

function extractPhone(main) {
  const root = main || document.body;

  // 1. tel: link
  const tel = root.querySelector('a[href^="tel:"]');
  if (tel) return decodeURIComponent(tel.href).replace(/^tel:/i, '').trim();

  // 2. data-item-id^="phone:tel:" — number encoded in attribute
  const phoneAttr = root.querySelector('[data-item-id^="phone:tel:"]');
  if (phoneAttr) {
    try {
      const raw = decodeURIComponent(
        phoneAttr.getAttribute('data-item-id').replace(/^phone:tel:/i, '')
      ).trim();
      if (raw && /\d{4,}/.test(raw)) return raw;
    } catch (_) {}
    const inner = norm(phoneAttr.textContent || '');
    const m = inner.match(/(\+?[\d][\d\s().‑\-]{5,}[\d])/);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 3. aria-label "Phone: ..." or "Call: ..."
  for (const node of root.querySelectorAll('[aria-label]')) {
    const label = norm(node.getAttribute('aria-label') || '');
    const m = label.match(/^(?:phone|call|tel)[:\s]+(\+?[\d][\d\s().‑\-]{5,}[\d])/i);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 4. aria-label that IS a phone number
  for (const node of root.querySelectorAll('[aria-label]')) {
    const label = norm(node.getAttribute('aria-label') || '');
    if (/^(\+?[\d][\d\s().‑\-]{5,}[\d])$/.test(label)) {
      const digits = label.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) return label;
    }
  }

  // 5. Leaf text scan
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

function extractWebsite(main) {
  const root = main || document.querySelector('[role="main"]') || document.body;

  // 1. data-item-id="authority" — the canonical Maps website button
  const authority = root.querySelector('[data-item-id="authority"]');
  if (authority) {
    const a = authority.tagName === 'A' ? authority : authority.querySelector('a');
    if (a && a.href) return unwrapUrl(a.href);
    const href = authority.getAttribute('href');
    if (href) return unwrapUrl(new URL(href, location.href).href);
  }

  // 2. data-item-id containing web/url/site
  for (const sel of ['[data-item-id*="web"]','[data-item-id*="url"]','[data-item-id*="site"]']) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const a = el.tagName === 'A' ? el : el.querySelector('a');
    const href = a?.href || el.getAttribute('href');
    if (href) {
      const clean = unwrapUrl(href);
      if (!/^https?:\/\/(www\.)?google\.|maps\./i.test(clean)) return clean;
    }
  }

  // 3. aria-label containing "website"
  for (const el of root.querySelectorAll('[aria-label]')) {
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('website') || label === 'web site') {
      const a = el.tagName === 'A' ? el : el.querySelector('a');
      const href = a?.href || el.getAttribute('href');
      if (href) return unwrapUrl(href);
    }
  }

  // 4. Any Google redirect link (/url?q=...) in the panel — these are always external website links
  for (const a of root.querySelectorAll('a[href]')) {
    const attr = a.getAttribute('href') || '';
    if (attr.includes('/url?q=') || attr.includes('maps/url?')) {
      const resolved = unwrapUrl(a.href);
      if (resolved !== a.href) return resolved;
    }
  }

  // 5. Any non-Google external link in the panel
  for (const a of root.querySelectorAll('a[href^="http"]')) {
    const h = a.href || '';
    if (!/google\.|goo\.gl|maps\.app/i.test(new URL(h).hostname)) {
      return unwrapUrl(h);
    }
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
  return {
    id: key, name,
    address:  extractAddress(main),
    phone:    extractPhone(main),
    website:  extractWebsite(main),
    mapsLink: window.location.href.split('?')[0],
    socials:  extractSocials(main),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForDetailLoaded(timeout = 12000) {
  return new Promise(resolve => {
    const start = Date.now();
    let h1SeenAt = 0;
    function check() {
      if (!window.location.href.includes('/maps/place')) { resolve(false); return; }
      if (Date.now() - start > timeout) { resolve(true); return; }
      const h1 = document.querySelector('[role="main"] h1') || document.querySelector('h1');
      if (!h1 || norm(h1.textContent).length < 2) { setTimeout(check, 300); return; }
      if (!h1SeenAt) h1SeenAt = Date.now();
      const hasPhone   = document.querySelector('[data-item-id^="phone:tel:"]') || document.querySelector('a[href^="tel:"]');
      const hasWebsite = document.querySelector('[data-item-id="authority"]') || document.querySelector('a[href*="/url?q="]');
      if (hasPhone || hasWebsite || (Date.now() - h1SeenAt) > 5000) { resolve(true); return; }
      setTimeout(check, 350);
    }
    check();
  });
}

function waitForListView(timeout = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      if (window.location.href.includes('/maps/place')) {
        if (Date.now() - start > timeout) { resolve(false); return; }
        setTimeout(check, 250); return;
      }
      if (document.querySelectorAll('a[href*="/maps/place/"]').length > 0) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 300);
    }
    check();
  });
}

function sendProgress(done, total, current, status) {
  try { chrome.runtime.sendMessage({ type: 'AUTO_SCRAPE_PROGRESS', done, total, current, status }); } catch (_) {}
}

let autoScraping = false;

// Find a fresh anchor in the current DOM matching the given name/href.
// IMPORTANT: must re-query DOM each time — old anchors go stale after history.back().
function findFreshAnchor(targetName, targetHref) {
  for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
    const name = norm(a.getAttribute('aria-label') || '');
    if (name !== targetName && a.href !== targetHref) continue;
    const rect = a.getBoundingClientRect();
    if (rect.width > 5 && rect.height > 5) return a;
  }
  return null;
}

async function runAutoScrape() {
  if (autoScraping) return { error: 'already_running' };
  autoScraping = true;

  // Collect name + href data only — NOT DOM references (they go stale after navigation)
  const seen = new Set();
  const targets = [];
  for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
    const rect = a.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) continue;
    const name = norm(a.getAttribute('aria-label') || '');
    if (!name || !isRealName(name)) continue;
    const key = placeKeyFromUrl(a.href) || name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    targets.push({ href: a.href, name, key });
  }

  const total = targets.length;
  let done = 0;
  const results = [];

  for (const target of targets) {
    if (!autoScraping) break;
    sendProgress(done, total, target.name, 'scraping');

    // Re-find anchor in the LIVE DOM — the list re-renders after each history.back()
    const anchor = findFreshAnchor(target.name, target.href);
    if (!anchor) {
      done++;
      sendProgress(done, total, target.name, 'scraping');
      continue;
    }

    // Scroll into view then click
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);
    anchor.click();
    await sleep(700);

    const loaded = await waitForDetailLoaded(12000);

    if (loaded) {
      await sleep(1500);
      const detail = extractDetailPanel();
      if (detail) {
        results.push(detail);
        try { chrome.runtime.sendMessage({ type: 'ADD_BUSINESSES', businesses: [detail] }); } catch (_) {}
      }
    }

    history.back();
    await waitForListView(8000);
    await sleep(700);
    done++;
    sendProgress(done, total, target.name, 'scraping');
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
  if (msg?.type === 'PING') { sendResponse({ pong: true }); return; }
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
