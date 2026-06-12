/* global chrome */

const countEl         = document.getElementById('count');
const statusEl        = document.getElementById('status');
const autoBtn         = document.getElementById('autoBtn');
const stopBtn         = document.getElementById('stopBtn');
const progressBox     = document.getElementById('progressBox');
const progressLabel   = document.getElementById('progressLabel');
const progressBar     = document.getElementById('progressBar');
const progressCurrent = document.getElementById('progressCurrent');
const exportHtmlBtn   = document.getElementById('exportHtmlBtn');
const exportCsvBtn    = document.getElementById('exportCsvBtn');
const clearBtn        = document.getElementById('clearBtn');
const previewList     = document.getElementById('previewList');

function setStatus(text, type) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

let isAutoScraping = false;

function setScrapingState(scraping) {
  isAutoScraping = scraping;
  autoBtn.classList.toggle('hidden', scraping);
  stopBtn.classList.toggle('hidden', !scraping);
  progressBox.classList.toggle('hidden', !scraping);
  exportHtmlBtn.disabled = scraping;
  exportCsvBtn.disabled  = scraping;
  clearBtn.disabled      = scraping;
}

function updateProgress(done, total, current) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressLabel.textContent = `Scraping ${done} / ${total}…`;
  progressBar.style.width   = pct + '%';
  progressCurrent.textContent = current ? `→ ${current}` : '';
}

function renderPreview(businesses) {
  if (!businesses || businesses.length === 0) {
    previewList.innerHTML = `<div class="empty">Open Google Maps, search for businesses,<br>then click <strong>Auto Scrape All Visible</strong>.</div>`;
    return;
  }
  const items = businesses.slice().reverse().slice(0, 30);
  previewList.innerHTML = items.map((b) => {
    const tags = [];
    if (b.phone)   tags.push(`📞 ${esc(b.phone)}`);
    if (b.website) tags.push(`🌐 ${esc(domainOf(b.website))}`);
    if (b.address && !b.phone && !b.website) tags.push(`📍 ${esc(b.address.substring(0, 40))}`);
    const s = b.socials || {};
    if (s.facebook)  tags.push('📘 FB');
    if (s.instagram) tags.push('📸 IG');
    if (s.tiktok)    tags.push('🎵 TT');
    if (s.twitter)   tags.push('🐦 X');
    if (s.youtube)   tags.push('▶ YT');
    if (s.linkedin)  tags.push('💼 LI');
    return `
      <div class="biz-card">
        <div class="biz-name">${esc(b.name || '(No name)')}</div>
        ${tags.length ? `<div class="biz-meta">${tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
      </div>`;
  }).join('');
}

async function getState() {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => resolve(res || {})));
}

async function refresh() {
  const state = await getState();
  countEl.textContent = String(state.count ?? 0);
  renderPreview(state.businesses || []);

  const p = state.autoScrapeProgress;
  if (p && p.status === 'scraping') {
    if (!isAutoScraping) setScrapingState(true);
    updateProgress(p.done, p.total, p.current);
  } else if (p && p.status === 'done' && isAutoScraping) {
    setScrapingState(false);
    setStatus(`Done! ${p.done} businesses scraped.`, 'ok');
    progressBox.classList.add('hidden');
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/google\.[a-z.]+\/maps/i.test(tab.url)) return null;
  return tab;
}

function pingTab(tabId) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, res => {
      resolve(!chrome.runtime.lastError && res?.pong === true);
    });
  });
}

async function ensureContentScript(tabId) {
  const alive = await pingTab(tabId);
  if (alive) return true;
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content/contentScript.js'] },
      () => resolve(!chrome.runtime.lastError)
    );
  });
}

async function autoScrape() {
  const tab = await getActiveTab();
  if (!tab) { setStatus('Open Google Maps first.', 'err'); return; }

  setScrapingState(true);
  setStatus('Injecting…');

  const ready = await ensureContentScript(tab.id);
  if (!ready) {
    setScrapingState(false);
    setStatus('Could not inject script. Reload Maps and try again.', 'err');
    return;
  }

  setStatus('');
  chrome.tabs.sendMessage(tab.id, { type: 'AUTO_SCRAPE' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      setScrapingState(false);
      setStatus(res?.error === 'already_running' ? 'Already scraping.' : 'Script error — reload Maps and try again.', 'err');
      return;
    }
    // Scraping runs in background; refresh() detects done via progress messages
  });
}

async function stopScrape() {
  const tab = await getActiveTab();
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'STOP_AUTO_SCRAPE' }, () => {});
  setScrapingState(false);
  setStatus('Stopped.', '');
}

function exportHtml() {
  setStatus('Exporting HTML…');
  exportHtmlBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'EXPORT_HTML' }, (res) => {
    exportHtmlBtn.disabled = false;
    if (!res?.ok) { setStatus('Export failed: ' + (res?.error || 'unknown'), 'err'); return; }
    setStatus('Saved: ' + res.filename, 'ok');
  });
}

function exportCsv() {
  setStatus('Exporting CSV…');
  exportCsvBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'EXPORT_CSV' }, (res) => {
    exportCsvBtn.disabled = false;
    if (!res?.ok) { setStatus('Export failed: ' + (res?.error || 'unknown'), 'err'); return; }
    setStatus('Saved: ' + res.filename, 'ok');
  });
}

function clearAll() {
  chrome.runtime.sendMessage({ type: 'CLEAR' }, () => { setStatus('Cleared.'); refresh(); });
}

autoBtn.addEventListener('click', autoScrape);
stopBtn.addEventListener('click', stopScrape);
exportHtmlBtn.addEventListener('click', exportHtml);
exportCsvBtn.addEventListener('click', exportCsv);
clearBtn.addEventListener('click', clearAll);

refresh();
const interval = setInterval(refresh, 2000);
window.addEventListener('unload', () => clearInterval(interval));
