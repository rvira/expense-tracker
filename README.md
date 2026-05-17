# Expense Tracker

A single-file expense tracker that runs entirely in the browser. No backend, no signup, no tracking — your data lives in `localStorage` on your device.

**Live site:** https://rvira.github.io/expense-tracker/ <!-- update if your GitHub username differs -->

## Features

- Add debit/credit entries with amount, date, category, payment method, and description
- Real-time totals for debited, credited, today's spend, and this month's spend
- Category breakdown donut chart
- Day-wise grouped transaction view with daily subtotals
- Quick filters (Today / Week / Month) plus custom From/To date range
- Export filtered data to CSV
- Light and dark theme toggle (light default), persisted
- Mobile-friendly with safe-area support, 44px touch targets, and iOS no-zoom inputs

## Use it

Open `index.html` in any modern browser, or visit the live site above.

## Data & privacy

Everything stays on your device. Clearing your browser data or switching browsers wipes your entries — use the **Export CSV** button to back up.

## Tech

One HTML file. Vanilla JS. CSS custom properties for theming. SVG donut chart drawn at render time. No dependencies, no build step.
