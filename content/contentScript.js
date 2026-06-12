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
    UI_NOISE.has(n.toLowerCase()) || /^[\d\s.,\-]+$/.test(n) ||
    /google\s+account/i.test(n) || /@\S+\.\S+/.test(n));
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

function extractSocials() {
  const socials = {};
  for (const a of document.body.querySelectorAll('a[href]')) {
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

function extractAddress() {
  for (const sel of ['[data-item-id="address"]','[data-tooltip="Copy address"]','button[data-item-id*="address"]']) {
    const el = document.querySelector(sel);
    if (el) {
      const text = norm(el.getAttribute('aria-label') || el.textContent || '');
      if (text.length > 3) return text.replace(/^address[:\s]*/i, '').trim();
    }
  }
  return '';
}

function extractPhone() {
  // 1. tel: link — Maps always includes one when a phone is listed
  const tel = document.querySelector('a[href^="tel:"]');
  if (tel) return decodeURIComponent(tel.href).replace(/^tel:/i, '').trim();

  // 2. data-item-id starting with "phone"
  const phoneEl = document.querySelector('[data-item-id^="phone"]');
  if (phoneEl) {
    try {
      const raw = decodeURIComponent(
        phoneEl.getAttribute('data-item-id').replace(/^phone:tel:/i, '').replace(/^phone:/i, '')
      ).trim();
      if (/\d{4,}/.test(raw)) return raw;
    } catch (_) {}
    const m = norm(phoneEl.textContent || '').match(/(\+?[\d][\d\s().‑\-]{5,}[\d])/);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 3. aria-label "Phone: ..." or "Call: ..."
  for (const el of document.querySelectorAll('[aria-label]')) {
    const label = norm(el.getAttribute('aria-label') || '');
    const m = label.match(/(?:phone|call|tel)[:\s]+(\+?[\d][\d\s().‑\-]{5,}[\d])/i);
    if (m && m[1].replace(/\D/g, '').length >= 7) return norm(m[1]);
  }

  // 4. aria-label that IS a phone number
  for (const el of document.querySelectorAll('[aria-label]')) {
    const label = norm(el.getAttribute('aria-label') || '');
    const m = label.match(/^(\+?[\d][\d\s().‑\-]{5,}[\d])$/);
    if (m) {
      const d = m[1].replace(/\D/g, '');
      if (d.length >= 7 && d.length <= 15) return m[1];
    }
  }

  // 5. TreeWalker scan — read every visible text node for a standalone phone number
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim();
      if (text.length < 5 || text.length > 25) continue;
      if (/^(\+?[\d][\d\s().‑\-]{5,}[\d])$/.test(text)) {
        const d = text.replace(/\D/g, '');
        if (d.length >= 7 && d.length <= 15) return text;
      }
    }
  } catch (_) {}

  return '';
}

function extractWebsite() {
  // 1. data-item-id="authority" — canonical Maps website button
  const authority = document.querySelector('[data-item-id="authority"]');
  if (authority) {
    const a = authority.tagName === 'A' ? authority : authority.querySelector('a');
    if (a && a.href) return unwrapUrl(a.href);
    const attr = authority.getAttribute('href');
    if (attr) { try { return unwrapUrl(new URL(attr, location.href).href); } catch (_) {} }
  }

  // 2. data-item-id variants
  for (const sel of ['[data-item-id*="web"]', '[data-item-id*="site"]']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const a = el.tagName === 'A' ? el : el.querySelector('a');
    const href = a?.href;
    if (href) {
      const clean = unwrapUrl(href);
      try { if (!/google\.|goo\.gl/i.test(new URL(clean).hostname)) return clean; } catch (_) {}
    }
  }

  // 3. aria-label "Website"
  for (const el of document.querySelectorAll('[aria-label]')) {
    const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
    if (label === 'website' || label.startsWith('open website') || label.startsWith('visit website')) {
      const a = el.tagName === 'A' ? el : el.querySelector('a');
      if (a?.href) return unwrapUrl(a.href);
    }
  }

  // 4. Google redirect links (/url?q=...) — Maps wraps all external links this way
  for (const a of document.querySelectorAll('a[href]')) {
    const attr = a.getAttribute('href') || '';
    if (attr.includes('/url?q=') || a.href.includes('/url?q=')) {
      const resolved = unwrapUrl(a.href);
      if (resolved !== a.href) return resolved;
    }
  }

  // 5. Any non-Google, non-social external link on the page
  const SKIP = /google\.|goo\.gl|maps\.app|facebook\.|instagram\.|twitter\.|x\.com|tiktok\.|youtube\.|linkedin\./i;
  for (const a of document.querySelectorAll('a[href^="https://"], a[href^="http://"]')) {
    try {
      const host = new URL(a.href).hostname;
      if (!SKIP.test(host)) return unwrapUrl(a.href);
    } catch (_) {}
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

  let h1 = null;
  for (const container of document.querySelectorAll('[role="main"]')) {
    h1 = container.querySelector('h1');
    if (h1) break;
  }
  if (!h1) h1 = document.querySelector('h1');
  if (!h1) return null;

  const name = norm(h1.textContent);
  if (!name || !isRealName(name)) return null;
  const key = placeKeyFromUrl(window.location.href) || name.toLowerCase();

  return {
    id:       key,
    name,
    address:  extractAddress(),
    phone:    extractPhone(),
    website:  extractWebsite(),
    mapsLink: window.location.href.split('?')[0],
    socials:  extractSocials(),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForDetailLoaded(timeout = 12000) {
  return new Promise(resolve => {
    const start = Date.now();
    let h1SeenAt = 0;
    function check() {
      if (Date.now() - start > timeout) { resolve(false); return; }

      // Not on detail page yet — keep waiting (do NOT resolve false here)
      if (!window.location.href.includes('/maps/place')) {
        setTimeout(check, 300); return;
      }

      const h1 = document.querySelector('h1');
      if (!h1 || norm(h1.textContent).length < 2) { setTimeout(check, 300); return; }
      if (!h1SeenAt) h1SeenAt = Date.now();

      const hasPhone   = document.querySelector('a[href^="tel:"]') || document.querySelector('[data-item-id^="phone"]');
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
      if (Date.now() - start > timeout) { resolve(false); return; }
      if (window.location.href.includes('/maps/place')) { setTimeout(check, 250); return; }
      if (document.querySelectorAll('a[href*="/maps/place/"]').length > 0) { resolve(true); return; }
      setTimeout(check, 300);
    }
    check();
  });
}

function sendProgress(done, total, current, status) {
  try { chrome.runtime.sendMessage({ type: 'AUTO_SCRAPE_PROGRESS', done, total, current, status }); } catch (_) {}
}

let autoScraping = false;

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

    const anchor = findFreshAnchor(target.name, target.href);
    if (!anchor) { done++; sendProgress(done, total, '', 'scraping'); continue; }

    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);
    anchor.click();
    await sleep(500);

    const loaded = await waitForDetailLoaded(12000);
    if (loaded) {
      await sleep(1500);
      const detail = extractDetailPanel();
      if (detail) {
        results.push(detail);
        chrome.runtime.sendMessage({ type: 'ADD_BUSINESSES', businesses: [detail] }, () => {
          if (chrome.runtime.lastError) { /* SW wake-up race — storage will have it */ }
        });
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
    if (autoScraping) { sendResponse({ ok: false, error: 'already_running' }); return false; }
    sendResponse({ ok: true, started: true });
    runAutoScrape();
    return false;
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
