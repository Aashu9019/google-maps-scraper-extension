/* global chrome */

const countEl       = document.getElementById('count');
const statusEl      = document.getElementById('status');
const autoBtn       = document.getElementById('autoBtn');
const exportHtmlBtn = document.getElementById('exportHtmlBtn');
const exportCsvBtn  = document.getElementById('exportCsvBtn');
const clearBtn      = document.getElementById('clearBtn');
const previewList   = document.getElementById('previewList');

function setStatus(text, type) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPreview(businesses) {
  if (!businesses || businesses.length === 0) {
    previewList.innerHTML = '<div class="empty">Open Google Maps and click Scrape.</div>';
    return;
  }
  previewList.innerHTML = businesses.slice(-20).reverse().map(b =>
    `<div class="biz-card"><div class="biz-name">${esc(b.name || '(No name)')}</div></div>`
  ).join('');
}

async function getState() {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => resolve(res || {})));
}

async function refresh() {
  const state = await getState();
  countEl.textContent = String(state.count ?? 0);
  renderPreview(state.businesses || []);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/google\.[a-z.]+\/maps/i.test(tab.url)) return null;
  return tab;
}

autoBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) { setStatus('Open Google Maps first.', 'err'); return; }
  chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW' }, (res) => {
    if (chrome.runtime.lastError) { setStatus('Reload the Maps page, then try again.', 'err'); return; }
    setStatus(`Captured ${res?.count ?? 0} businesses.`, 'ok');
    refresh();
  });
});

exportHtmlBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_HTML' }, (res) => {
    if (!res?.ok) { setStatus('Export failed.', 'err'); return; }
    setStatus('Saved: ' + res.filename, 'ok');
  });
});

exportCsvBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_CSV' }, (res) => {
    if (!res?.ok) { setStatus('Export failed.', 'err'); return; }
    setStatus('Saved: ' + res.filename, 'ok');
  });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR' }, () => { setStatus('Cleared.'); refresh(); });
});

refresh();
