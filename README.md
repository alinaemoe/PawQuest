# PawQuest

Offline-first mobile journal for dog owners: walks with GPS, training sessions and behavior
observations in one history, with honest statistics (always with sample size, never "because").

> Understand your dog. One walk at a time.

Status: **Phase 0 (foundation)**. The product specification lives in [`docs/`](docs/00-README.md)
(start with `docs/00-README.md`); the decision log is `docs/02-decisions.md`.

## Requirements

- Node.js >= 22.14 (see `.nvmrc`)
- pnpm 12 (`npm install -g pnpm@12.11.2`; the exact version is pinned in `package.json`)

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm run check      # prettier + eslint + tsc + tests with coverage gates
```

Individual commands: `pnpm run format`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`.

## Layout

| Path                                                | What                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/core`                                     | Pure domain logic, no React/Expo/I/O: haversine distance, GPS point filter (A-01) |
| `docs/`                                             | Specification v1.0 (screens, data model, algorithms, risks, roadmap)              |
| `docs/prototype`                                    | Clickable HTML prototype of the UI                                                |
| (planned) `apps/*`                                  | Expo app (Android first) and web demo                                             |
| (planned) `packages/insights`, `data`, `ui`, `i18n` | Analytics, SQLite layer, design tokens, translations                              |

## Engineering rules

- TypeScript `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; ESLint
  `strictTypeChecked` (no `any`, no floating promises).
- Domain code is developed test-first. Coverage is a hard gate in `packages/core`
  (95% lines/functions/statements, 90% branches). Algorithms in the spec are covered by example
  tests, property-based tests (fast-check) and verified by mutation checks before a step is closed.
- The spec wins over code, and code wins over memory: when implementation reveals a defect in the
  spec, the spec is fixed first and recorded in `docs/02-decisions.md` (example: D-46).
- Real user data and secrets never enter the repository (see `.gitignore`).

## License

MIT, see [`LICENSE`](LICENSE).
