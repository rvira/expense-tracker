# Expense Tracker

A single-file expense tracker that runs entirely in the browser. Works offline with your data in `localStorage`, and optionally syncs across all your devices by signing in with GitHub — no separate backend, no third-party service.

**Live site:** https://rvira.github.io/expense-tracker/ <!-- update if your GitHub username differs -->

## Features

- Add debit/credit entries with amount, date, category, payment method, and description
- Edit any existing entry (tap the ✎ icon on a row)
- Real-time totals for debited, credited, today's spend, and this month's spend
- Category breakdown donut chart
- Day-wise grouped transaction view with daily subtotals
- Quick filters (Today / Week / Month) plus custom From/To date range
- Export filtered data to CSV
- Light and dark theme toggle (light default), persisted
- **Cross-device sync via GitHub login** (see below)
- Mobile-friendly with safe-area support, 44px touch targets, and iOS no-zoom inputs

## Login & cross-device sync

By default the app stores everything locally in your browser. Sign in with GitHub to sync your data across phones, tablets, and computers. Data is saved as JSON to your own repo (`data/expenses.json`) — you own it, and there's no server in between.

### One-time setup per device

1. Open the app and tap the **Sign in** chip in the top-right (next to the theme toggle).
2. Follow the in-app instructions to generate a **fine-grained Personal Access Token**:
   - Go to **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**
   - **Repository access:** Only select repositories → this repo
   - **Permissions → Repository → Contents:** Read and write
   - Generate, copy the token (shown once)
3. Paste the token into the app and tap **Connect**.

That's it. The token is stored only in that device's `localStorage` and sent only to `api.github.com` over HTTPS. Repeat on each device you want to sync (paste the same token, or generate one per device).

### How sync behaves

- **Automatic:** every add / edit / delete is pushed to GitHub (debounced, batched).
- **Conflict-safe:** if two devices change data, entries are merged by id and the most recently edited version of each wins; deletes are tracked with tombstones so they don't reappear.
- **Offline-friendly:** changes are kept locally and pushed automatically when you're back online.
- **Status at a glance:** the sync chip shows `Sign in` / `Syncing…` / `@you` (synced) / `Offline` / `Sync error`.
- **Sign out:** tap the chip when signed in → **Sign out (this device)**. This removes the token from that browser; your local data stays.

## Use it

Open `index.html` in any modern browser, or visit the live site above. Login is optional — skip it to stay fully local.

## Data & privacy

- **Local-only mode:** everything stays in your browser. Clearing browser data or switching browsers wipes your entries — use **Export CSV** to back up.
- **Signed-in mode:** data is synced to `data/expenses.json` in the configured GitHub repo. If that repo is public, your spending data is publicly visible — use a private repo (with a token scoped to it) if you want it private.
- Your access token never leaves your device except in authenticated requests to GitHub.

## Reusing the sync in your own project

The login + sync logic lives in [`gh-sync.js`](gh-sync.js) as a standalone, dependency-free `GhSync` class you can drop into any static site:

```html
<script src="gh-sync.js"></script>
<div id="sync-mount"></div>

<script>
  const sync = new GhSync({
    owner: 'your-username',
    repo: 'your-repo',
    branch: 'main',
    path: 'data/app.json',
    appName: 'My App',
    storagePrefix: 'myapp',
    mountChip: '#sync-mount',
    merge: (remote, local) => ({ /* combine and return merged data */ }),
    buildPayload: () => ({ /* current app data to save */ }),
    onLoad: (data) => { /* apply remote data to your app state */ },
  });

  // Call after any local change:
  sync.scheduleSync();
</script>
```

The library handles the sign-in modal, token storage, GitHub Contents API calls, conflict retry, offline detection, and the status chip. It auto-injects its own (themeable) CSS and inherits your app's `--accent` / `--card-bg` / etc. variables when present.

## Tech

Two files, no build step, no dependencies: `index.html` (app) and `gh-sync.js` (reusable sync). Vanilla JS, CSS custom properties for theming, SVG donut chart drawn at render time.
