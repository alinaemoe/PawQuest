# PawQuest

**Understand your dog. One walk at a time.**

PawQuest is an offline-first mobile journal for dog owners. It records GPS walks, training sessions
and behavior observations in one history, and turns them into **honest statistics**: every insight
shows its sample size and confidence, and the app never claims "because".

No accounts, no backend, no AI. Your dog's data stays on your phone.

## What it does

- **Walks with a real map.** Background GPS recording (foreground service on Android), pause/resume,
  crash recovery, route on an OpenFreeMap vector map in light and dark styles, and one-tap event
  buttons during the walk (3x3 grid) with a reaction-distance timer.
- **Walk Replay.** Scrub a finished walk by time, paint the route by speed or by place, compare with a
  usual walk, and view two walks side by side.
- **Places and zones.** Saved places are suggested by DBSCAN clustering of walk points; names are
  normalized and de-duplicated; entering a place during a walk shows a chip and a toast.
- **Training "clicker".** Skills built from templates with levels, a session screen for quick
  success/fail marks, and a prompt when the dog is ready for the next step.
- **Behavior diary (ABC).** Antecedent-behavior-consequence entries with scales, filters and edit
  history.
- **Insights with statistics that don't overclaim.** Wilson intervals, permutation tests, Theil-Sen /
  Mann-Kendall trends, Benjamini-Hochberg correction for pattern cards, and a check that a pattern
  isn't just a stand-in for weather or place. Sections for skills, places, behavior, health and
  activity.
- **Health care.** Deworming, ticks, vaccination and check-up plans, vet visits, weight and nutrition,
  local reminders with *Done / Snooze* actions.
- **Goals and "paws".** Streaks with pause paws, achievements and levels (design in progress).
- **PDF report for a specialist** (trainer or vet), backup/restore, RU/EN interface, four palettes.
- **Web demo.** The *same app* runs in the browser on `sql.js` (SQLite in WebAssembly) with a demo
  dog - no second codebase.

## Engineering

| | |
|---|---|
| **Stack** | TypeScript (strict, `noUncheckedIndexedAccess`), Expo / React Native, Expo Router, SQLite + Drizzle, MapLibre, Zod, i18next, pnpm workspaces |
| **Architecture** | Pure domain logic in `packages/core` (no React/Expo/I-O), analytics in `packages/insights`, data layer in `packages/data`, UI kit and screens as separate packages, web demo reuses the same screens and repositories |
| **Quality gates** | ~130 test files; Vitest + fast-check property tests; coverage gates on core; algorithms verified by mutation checks before a step is closed; ESLint `strictTypeChecked`, Prettier, `tsc` in `pnpm run check` |
| **Process** | Spec-first: a full product specification (screens, data model, algorithms, risks, roadmap) in [`docs/`](docs/00-README.md) and a decision log with 70+ entries ([`docs/02-decisions.md`](docs/02-decisions.md)). When code reveals a spec defect, the spec is fixed first |
| **Device-tested** | Spikes for background GPS, map rendering, 10k-point replay, 1M-point SQLite, notification actions and a proximity-sensor pocket mode were measured on a real Android phone |

Start with the clickable HTML prototype in [`docs/prototype`](docs/prototype/index.html) or the spec
index in [`docs/00-README.md`](docs/00-README.md).

## Run it

Requirements: Node.js >= 22.14 (see `.nvmrc`) and pnpm (the exact version is pinned in `package.json`).

```bash
pnpm install --frozen-lockfile
pnpm run check            # prettier + eslint + tsc + tests with coverage gates
```

Mobile app (Android dev build; Expo Go is not supported because of background location and MapLibre):

```bash
cd apps/mobile
pnpm run android          # expo run:android
```

Web demo: `pnpm run web` inside `apps/web-demo`.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Expo app (screens, navigation, platform services, native proximity module) |
| `apps/web-demo` | Browser build with demo data (SQLite via sql.js) |
| `packages/core` | Haversine, GPS point filter, smoothing/simplification, moving time, pace, DBSCAN |
| `packages/insights` | Confidence labels, Wilson interval, permutation tests, trends, streaks |
| `packages/data` | SQLite schema, migrations, repositories |
| `packages/screens`, `rn-ui`, `ui`, `i18n`, `weather` | Screens, components, tokens, translations, Open-Meteo client |
| `docs/` | Specification, decision log, roadmap, prototype |

Real user data and secrets never enter the repository (see `.gitignore`).
