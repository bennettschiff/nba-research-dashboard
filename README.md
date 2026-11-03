# NBA Research Dashboard

A daily NBA research dashboard: player projections priced against the market
at the main line and every alternate rung, game lines, tonight's qualifying
plays, and a graded ledger of everything the model priced.

**Live:** https://nba.schiffpicks.com · React 19 · Vite · Vercel (functions + Blob) · Supabase · GitHub Actions

> **About this repository.** This is a public showcase copy of a private repo.
> It contains the real UI, API routes, ledger schema, data-pull scripts, and the
> pricing layer. **The projection engine, its fitted parameters, the nightly
> job that runs it, and the backtest are private.** `src/lib/model.js` keeps
> the pricing math (negative binomial laws, Shin de-vigging, alt-line ladder,
> play gates) with illustrative parameters. Git history is not included.

<!-- Screenshot: add docs/screenshot.png and uncomment
![NBA Research Dashboard](docs/screenshot.png)
-->

## What it does

- **Board.** Every rotation player on tonight's slate with a projection per
  stat, the market's implied mean, and the side and size of the disagreement.
- **Player panel.** Recent games, per-36 rates, on/off splits with each
  teammate, and a full price ladder: Win %, fair price, posted or estimated
  book price and EV at every alternate line.
- **Plays.** The rows that clear the gates (edge band, price range, positive
  EV, on the projection's side, enough games and minutes), one per player.
- **Games.** Spread, total and moneyline priced from team ratings.
- **Results.** Every priced row graded, by market, with each market's
  proven/probation standing.

## Architecture

```
 GitHub Actions (morning + pre-tip)
   ├ update-logs.mjs      box scores → logs (Drive)
   ├ pull-nba-odds.mjs    odds → Drive archive (never Postgres)
   ├ [private] project, price, freeze, grade
   └ backup-to-drive.mjs
            │                         │
            ▼ slate JSON              ▼ ledger rows
      Vercel Blob  ◄── /data/*    Supabase (nba_picks, RLS)
            ▲                         ▲ publishable key via /api
 Browser (React SPA) ── Vercel ───────┘
```

The page never talks to the database directly: it loads one precomputed
slate file from Blob and reads the ledger through `/api` functions that call
read-only Postgres functions.

## Where to look

| Area | Files |
|---|---|
| Negative-binomial pricing, Shin no-vig, and the alt-line ladder | `src/lib/model.js` |
| Consensus across books and parsing the odds feed | `src/lib/markets.js` |
| Play gates and one-play-per-player | `src/lib/model.js` `gateVerdict`, `onePerPlayer`, `src/lib/gates.json` |
| Ledger decoding and records | `src/lib/ledger.js`, `scripts/lib/ledger.test.mjs` |
| Ledger schema | `db/` |

## Running it

```bash
npm ci
npm test        # node --test, no network or keys needed
npm run build
npm run dev     # http://localhost:5173
```

The board needs a slate file and the `/api` routes need `.env.local` (see
`.env.example`), so a bare local run shows the shell only.

## License

All rights reserved. The code is published for viewing and evaluation; see [LICENSE](LICENSE).
