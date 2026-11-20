# Astris

Astris turns Wikipedia into a constellation: search an article, watch its related articles grow around it as stars, and click a star to travel there. It is a static site with no backend: Vite, TypeScript in strict mode, and the Canvas 2D API. No UI framework.

The full plan is the Astris Build Spec. `reference/mockup.html` is the source of truth for look and behaviour. Where the spec is silent, match the mockup. Where they disagree, the spec wins.

## Commands

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Local server with hot reload                                         |
| `npm run typecheck` | `tsc --noEmit`, strict                                               |
| `npm run lint`      | ESLint, Prettier check, and the hex-colour check                     |
| `npm run format`    | Prettier write                                                       |
| `npm test`          | Vitest unit tests in `tests/unit`                                    |
| `npm run build`     | Production build into `dist/`                                        |
| `npm run test:e2e`  | Playwright smoke tests in `tests/e2e`, run against the built preview |
| `npm run ci`        | All of the above, in the order the `ci` check runs them              |

Run `npm run build` before `npm run test:e2e`. Playwright is pinned to 1.63.0.

## Layout and ownership

Each folder under `src/` has one owning thread.

| Path            | Owner    | What lives there                                                                 |
| --------------- | -------- | -------------------------------------------------------------------------------- |
| `src/types.ts`  | Scaffold | The shared contract: `Star`, `Constellation`, `DataProvider`                     |
| `src/styles/`   | Scaffold | `tokens.css` (every colour, font and timing), base and responsive CSS, `token()` |
| `src/lib/`      | Scaffold | Pure helpers: `hash`, `esc`, `ease`, `spring`, `clock`                           |
| `src/main.ts`   | Scaffold | Wires provider, map and site together. The provider is chosen here.              |
| `src/data/`     | Data     | Providers (`SampleProvider`, later `WikipediaProvider`), ranking, cache          |
| `src/engine/`   | Engine   | Layout, sprites, renderer, travel, memories, input. Numbers in `config.ts`.      |
| `src/site/`     | Site     | Main page, design system page, header, side menu, footer, routing, `site.css`    |
| `src/modes/`    | Modes    | The map screen (`play.ts`), panel, Explore and Race, `play.css`                  |
| `src/comforts/` | Comforts | Hover card, keyboard reach, discovery counter, later share links                 |
| `index.html`    | Site     | All markup. The map's markup (`#play`) belongs to Modes.                         |
| `tests/`        | everyone | `tests/unit/<module>.test.ts` and `tests/e2e/`                                   |
| `reference/`    | nobody   | The mockup. Never edited.                                                        |

How the modules meet:

- The engine draws whatever `Constellation` it is given and never fetches. It reports clicks through `onPick(title)`; `Play` asks the provider and calls `engine.travel(data)`.
- Everything that needs data takes a `DataProvider`. Nothing outside `src/data/` knows which provider is running.
- A module imports another module only through that module's `index.ts`, or `src/types.ts`. ESLint enforces this.
- No hex colour outside `src/styles/tokens.css`. ESLint and `scripts/check-tokens.mjs` enforce this. In TypeScript, read a colour with `token('--name')` or `subjectRgb(subject)` from `src/styles`.

## Rules every thread follows

1. Branch from the latest `integration`. Name the branch `feat/<thread>/<topic>`.
2. Keep a pull request to one task and under about 400 changed lines.
3. Edit only files in the thread's own folder. If a change outside it is unavoidable, say so in the pull request title.
4. Never edit `reference/mockup.html`.
5. Never edit `src/types.ts` except in a pull request titled `contract: ...` with auto-merge off. Nathan approves it.
6. Add or update a test for any logic changed.
7. Open the pull request against `integration`, enable auto-merge with squash, and write what changed and how it was checked.
8. If the branch conflicts, rebase on `integration` and resolve. Do not force a merge.
9. Stop and ask Nathan when a task needs a decision listed under the spec's open decisions.
10. Never skip, disable or weaken a test or a lint rule to get the `ci` check green.

`main` is the live site. Only Nathan merges `integration` into `main`.

## Conventions

- Prettier decides formatting: single quotes, 180 columns, trailing commas.
- TypeScript is strict with `noUncheckedIndexedAccess`. No `any`, no non-null `!` in `src/`.
- Text put into `innerHTML` goes through `esc()`.
- Honour reduced motion: with the system setting on, draw the finished picture with no bloom, drift or twinkle.
- Wikipedia's text is CC BY-SA 4.0. Wherever an article summary appears, link to the article and name the licence. Never use Wikipedia's logo, globe or wordmark.
