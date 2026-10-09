# Project instructions

## Priorities

162-0 is a pre-release baseball game with a limited audience, not a stable public platform. Favor improving the game and simplifying the implementation over preserving yesterday's contracts. These project-specific priorities take precedence over generic compatibility and exhaustive-testing preferences.

- Make the requested change decisively. Breaking an existing API, internal abstraction, schema, or simulation model is acceptable when it serves that change.
- Do not expand the task into production hardening, speculative edge cases, or infrastructure for hypothetical future users.
- Ask about unresolved gameplay or product choices, not whether already-authorized compatibility breaks are allowed.
- An intentional design change is not a regression. Accidentally breaking current intended gameplay is.

## Compatibility and saves

Follow the release policy in `PRODUCT.md`.

- Existing saves, replay links, data formats, and seeded results are disposable across releases. Do not delay work to preserve them or ask for permission each time.
- Prefer a clean cutover: update current callers and remove obsolete paths. Do not add migrations, compatibility shims, dual engines, deprecated aliases, or legacy fixtures unless explicitly requested.
- Version the current contract and reject incompatible data clearly. A fresh-start path is sufficient; do not silently reinterpret old data as current data.
- Determinism matters within the same supported model and data version. Identical results across different releases are not a requirement.
- This is permission to replace obsolete contracts, not to delete unrelated work or erase external data indiscriminately.

## Verification without ceremony

Use verification to establish that the requested behavior works, not to maximize coverage or freeze the implementation.

- Choose checks based on the changed behavior and plausible failure modes. Do not invent coverage targets, exhaustive matrices, or tests for every helper.
- Exercise the actual changed path. For UI work, inspect it in the browser; for simulation work, run a season or the relevant simulation path. Tests alone do not establish visual quality or playability.
- Add focused regression tests for meaningful bugs and behavior tests for new functionality. Prefer a few useful assertions over a large suite of mocks, wiring checks, snapshots, or incidental details.
- When a deliberate change invalidates a test, update or remove the obsolete expectation. Do not preserve unwanted behavior just to keep a test green. Do not disable checks that still protect current requirements.
- During iteration, run targeted checks. Before committing code, run the relevant suite; the entire unit/browser/Storybook/calibration pipeline is not the default gate for every edit.
- Documentation-only changes need documentation and command checks, not an application test campaign.
- Report what was exercised and any remaining concrete risk. Do not turn hypothetical failures into blockers.

## Project orientation

- `PRODUCT.md`: product constraints and release policy.
- `DESIGN.md`: current visual and interaction conventions.
- `design/README.md`: intended simulation and Draft Mode rules, decisions, and phase dependencies. These specifications are not proof that a feature is implemented.
- `README.md`: current behavior, setup, data preparation, and deployment details.
- `src/lib/game/`: draft/session state, replay sharing, and results models.
- `src/lib/sim/`: season simulation.
- `src/lib/cards/`, `src/lib/components/`, `src/lib/storybook/`: cards, application UI, and isolated workshop surfaces.
- `src/lib/server/`, `src/lib/share/`: trusted share publication and artwork.

Ordinary simulation runs in the browser. Published sharing uses trusted server-side recomputation. Do not add accounts or a database without a product requirement.

## Commands and environment

Use Node >=24.12 and npm. Prefer existing `just` recipes.

- `npm ci`: install dependencies.
- `just dev --host 127.0.0.1 --port 5173`: local application.
- `npm run check`: Svelte and TypeScript checks.
- `npm run test:unit -- <test-file>`: targeted unit tests; omit the file for the unit suite.
- `npm run test:e2e -- <test-file>`: targeted browser tests.
- `just test`: unit and application browser suites.
- `just smoke --seed 162 --policy best`: draft and full-season smoke run.
- `just storybook`: isolated component workshop.
- `just storybook-test`: workshop browser suite when relevant.

Development and builds prepare assets automatically. Initial preparation requires network access and ImageMagick. Generated assets and caches stay out of source control. Browser tests require `npx playwright install chromium`; use an isolated `PLAYWRIGHT_PORT` or `STORYBOOK_TEST_PORT` when needed. Automated verification uses local Worker/R2 fixtures, never the paid remote `BROWSER` binding.

Use `jj`, not raw `git`. Leave other workspaces and unrelated changes alone. Run browsers headlessly without audio or taking focus. Update existing documentation when behavior changes; do not add standalone reports or architectural essays unless requested.
