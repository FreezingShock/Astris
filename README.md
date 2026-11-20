# Astris

The map of everything Wikipedia connects. Search an article, watch its related articles grow around it as stars, and click a star to travel there.

Astris is a static site: Vite, strict TypeScript and the Canvas 2D API, with no backend. It currently runs on built-in sample data; live Wikipedia data is the next milestone.

## Run it

```sh
npm install
npm run dev
```

## Check it

```sh
npm run ci   # type check, lint, unit tests, build, browser smoke tests
```

## Where things are

- `reference/mockup.html` is the reference build for look and behaviour. It is never edited.
- `src/` holds one folder per workstream: `data`, `engine`, `site`, `modes`, `comforts`, plus the shared `types.ts`, `styles` and `lib`.
- `CLAUDE.md` has the folder ownership table and the rules for contributing.

Astris is not affiliated with or endorsed by the Wikimedia Foundation. Wikipedia's text is available under the Creative Commons Attribution-ShareAlike 4.0 licence.
