dev *args:
    npm run dev -- {{args}}

# Cargo tests read the prepared dataset, which the browser suite's build prepares.
test:
    npm test
    cargo test --workspace

media-discover *args:
    npm run media:discover -- {{args}}

media-audit:
    npm run media:audit

media-review *args:
    npm run media:review -- {{args}}

media-prepare *args:
    npm run media:prepare -- {{args}}

statcast *args:
    npm run data:statcast -- {{args}}

engine:
    npm run engine

smoke *args:
    npm run smoke -- {{args}}

calibrate *args:
    npm run calibrate -- {{args}}

bench *args:
    npm run bench -- {{args}}

# Drafts rosters natively with calibration policies (random, best, vorp, packs; comma-separated) and
# plays each over many season seeds, all in parallel. Prints {label, valueRuns, jackpots, wins} lines.
# Example: just draft-spread vorp,packs 1 300 --seasons 100 --jackpots 2,0.2
draft-spread policy from to *args:
    cargo run --release --quiet -p engine-cli -- draft-spread --policy {{policy}} --from {{from}} --to {{to}} {{args}}

# Measures sticker earn rates over natively drafted and simulated seasons and rewrites
# src/lib/collection/sticker-rarity.json, which ranks the stickers a card face shows.
# Example: just sticker-rarity --from 1 --to 300 --seasons 10
sticker-rarity *args:
    node scripts/sticker-rarity.ts {{args}}

# Measure every era front in a running Storybook and choose its sticker slots, writing
# src/lib/collection/sticker-layout.json and sticker-slots.json. --solve re-solves the committed layout.
# Example: just sticker-slots --storybook http://127.0.0.1:6409
sticker-slots *args:
    node scripts/sticker-slots.ts {{args}}

hill-climb *args:
    npm run data:prepare
    cargo run --release --quiet -p engine-cli -- hill-climb {{args}}

hill-climb-replay *args:
    cargo run --release --quiet -p engine-cli -- hill-climb-replay {{args}}

draft-feasibility *args:
    npm run draft:feasibility -- {{args}}

deploy:
    npm run build
    npx wrangler deploy

storybook *args:
    npm run storybook -- {{args}}

storybook-build:
    npm run build-storybook

storybook-test *args:
    npm run test:storybook -- {{args}}

feedback *args:
    npx --no-install agentation-mcp server --host 127.0.0.1 --port 4747 {{args}}

feedback-doctor:
    npx --no-install agentation-mcp doctor --http-url http://127.0.0.1:4747

# Copies the card light engine (renderer, films, finishes, colourways and plates) into another project, e.g. the
# Foil Lab toy: `just foil-engine-export ~/alpacasoft/apps/foil-lab/src/lib/engine`. The copy keeps this tree's paths.
foil-engine-export dest:
    rm -rf "{{absolute_path(dest)}}/cards"
    mkdir -p "{{absolute_path(dest)}}/cards/surface"
    cp src/lib/cards/era.ts src/lib/cards/finish.ts src/lib/cards/hgh.ts "{{absolute_path(dest)}}/cards/"
    cd src/lib/cards/surface && cp light-renderer.ts light-shader.ts holo-films.ts foil-plates.ts circuit-tile.ts surfaces.ts "{{absolute_path(dest)}}/cards/surface/"
    cd src/lib/cards/surface && for dir in films finishes palettes plates; do mkdir -p "{{absolute_path(dest)}}/cards/surface/$dir" && cp $dir/*.ts "{{absolute_path(dest)}}/cards/surface/$dir/"; done
    find "{{absolute_path(dest)}}/cards" -name '*.test.ts' -delete
