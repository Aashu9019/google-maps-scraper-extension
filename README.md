# Google Maps Business Scraper Extension

A Chrome/Edge MV3 extension that auto-scrapes business listings from Google Maps — name, phone, website, address, and social media links — with one click.

## Features

- **Auto-scrape**: Automatically clicks each visible business, opens the detail panel, extracts data, and returns to the list — no manual clicking needed
- **Data captured**: Business name, phone number, website, address, Google Maps link, Facebook, Instagram, TikTok, Twitter/X, YouTube, LinkedIn
- **Export HTML**: Beautiful card-based report with a "Mark as Contacted" tick button per business, filter bar (All / Not Contacted / Contacted), and contact stats — state persists via localStorage
- **Export CSV**: Spreadsheet-ready export with all 11 columns
- **Live preview**: Popup shows captured businesses in real-time as scraping progresses
- **Stop button**: Cancel a scrape mid-run

## Installation

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** and select the `extension/` folder

## Usage

1. Open [Google Maps](https://www.google.com/maps) and search for businesses (e.g. "plumbers in Perth")
2. Click the extension icon in your toolbar
3. Click **🤖 Auto Scrape All Visible**
4. Wait for the progress bar to complete — the extension visits each business automatically
5. Scroll the Maps list to load more businesses, then scrape again to add them
6. Click **Export HTML** for an interactive report or **Export CSV** for a spreadsheet

## How the Mark-as-Contacted feature works

The exported HTML file has a checkmark (✓) button on each business card. Click it to mark the business as contacted — the card turns green. Your progress is saved in the browser's `localStorage` so it persists between sessions.

Use the filter buttons at the top to view **All**, **Not Contacted**, or **Contacted ✓** businesses.

## File Structure

```
extension/
├── manifest.json              # MV3 manifest
├── content/
│   └── contentScript.js       # DOM scraping + auto-scrape loop
├── service_worker/
│   └── background.js          # Storage, HTML/CSV export
└── popup/
    ├── popup.html             # Extension popup UI
    └── popup.js               # Popup logic
```

## Permissions

- `activeTab` + `scripting` — inject content script on demand
- `downloads` — save exported files
- `storage` — future use
- Host permission: `https://www.google.com/maps/*`
