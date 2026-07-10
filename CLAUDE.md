# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Team-splitter tool for a weekly 5-a-side football ("calcetto") game, Italian-language UI.

- `calcetto-squadre.html` — standalone browser app (React + Babel classic-runtime inline via CDN, no build) with the "Stadio di Notte" dark-stadium skin (Barlow Condensed, floodlight vignette, pitch-line watermark). Uses `localStorage` for persistence. The JSX lives in a `text/plain` script tag compiled manually with `runtime: "classic"` — Babel's default automatic runtime emits an ES `import` that breaks without a bundler.
- `manifest.json`, `icon-192.png`, `icon-512.png`, `sw.js` — PWA shell: installable manifest, app icons, and a minimal cache-first service worker that precaches `calcetto-squadre.html` + assets so the app opens offline after one online visit.
- `netlify.toml` — redirects `/` to `/calcetto-squadre.html` on deploy.

Storage keys: `calcetto-roster` (permanent roster; guests filtered out before writing) and `calcetto-history` (last 30 saved formations).

No build tooling, no package.json, no test runner. To syntax-check after edits: compile the JSX with `@babel/standalone` in node.

## Architecture

- **Splitting algorithm** (`allSplits`, `bestBalancedSplits`): brute-force enumerates every two-group split of present players (anchoring `players[0]` in group A to skip mirrored duplicates), scores by absolute rating-sum difference, pools all splits within `minDiff` (widening +1 if fewer than 4 candidates). A secondary goalkeeper criterion then narrows *within* that pool: each player has `gkLevel` (`good`/`average`/`poor` → weight 2/1/0, missing field reads as `average`), and the pool is restricted to minimal `|gkSumA − gkSumB|` with the same ≥4-candidates widening. Rating balance is never violated by the gk pass; all-average rosters behave exactly as the pre-gk algorithm.
- **`App`**: owns all state (roster, `presentIds`, draw `result`, `history`). Persists roster on change (guests with `isGuest: true` are filtered out, so they vanish on reload); history is written only by the explicit `saveFormation` action (max 30 records). Three tabs: `MatchView` ("Oggi"), `RosterView` ("Rosa"), `HistoryView` ("Storico").
- **`runDraw(excludeLast)`**: random pick from the balanced pool; `excludeLast` filters out the currently-shown split on reshuffle. Runs a ~10-tick 90ms flicker animation via `spinRef` before settling.
- **`swapInResult(idA, idB)`**: post-draw manual correction — swaps one player from each team inside `result` only (pool/history untouched), recomputing sums. Driven by chip selection in the TeamCards (select one, tap one on the opposite team).
- **`RosterView`**: add/remove players, 1–10 rating in half-point steps (slider + typed input via `clampRating`, accepts comma decimals), gk aptitude picker, presence counter derived on the fly from history.
- **`MatchView`**: presence toggles with search filter (Enter toggles first match), one-night guest form, draw trigger, "Salva formazione" button, TeamCards.
- **Share card** (`drawFormationCard` + helpers): 1080×1350 canvas image of the formation on a stylized pitch (striped grass, boxes, center circle, header with Italian date, Rossa/Blu labels). **No numeric data on the shared image or fallback text** — no player ratings, no team averages/scores; names, team labels, title and date only (the on-screen TeamCards keep showing rating/media, the constraint is share-only). Player placement is purely aesthetic — `layoutRows(n)` depends only on head count (rows = ⌈√n⌉, spread evenly), never on rating/gkLevel; blue half is mirrored. Palette hardcoded in `CARD_C` (canvas can't read CSS vars); waits on `document.fonts.ready` before drawing. "Condividi" opens a preview modal → `navigator.canShare({files})` native sheet → PNG download fallback → clipboard text fallback; in a sandboxed host the preview itself is the last-resort (manual screenshot).

State flow is one-directional and local to `App` — no external state management, no routing, no network calls beyond storage.
