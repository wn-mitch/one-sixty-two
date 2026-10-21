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

# Inventory and capture full card fronts for local visual framing review.
card-framing *args:
    node scripts/media/framing-audit.ts {{args}}

# Reconcile valid captures with individual visual review records.
card-framing-gallery *args:
    node scripts/media/framing-gallery.ts {{args}}

media-prepare *args:
    npm run media:prepare -- {{args}}

# Refresh the static loading-card bank from a running local app; requires ImageMagick.
loading-cards *args:
    node scripts/loading-cards.ts {{args}}

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

# Drafts rosters natively with calibration policies (random, best, vorp, packs, chalk; comma-separated) and
# plays each over many season seeds, all in parallel. Prints {label, valueRuns, jackpots, chalk, edge, wins} lines.
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


# Keep native tooling independent of the selected global command-line tools.
ios_developer_dir := env_var_or_default("DEVELOPER_DIR", "/Applications/Xcode.app/Contents/Developer")

# Requires Xcode and XcodeGen; no npm assets or Rust rebuild are needed.
ios-project:
    xcodegen generate --spec ios/project.yml

ios-build: ios-project
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -project ios/OneSixtyTwo.xcodeproj -scheme OneSixtyTwo -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build build CODE_SIGNING_ALLOWED=NO


# Checks device compilation without a signing identity or App Store upload.
ios-device-build: ios-project
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -project ios/OneSixtyTwo.xcodeproj -scheme OneSixtyTwo -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath ios/build build CODE_SIGNING_ALLOWED=NO
# Run in a separate terminal while the deterministic native suite executes.
ios-fixtures:
    python3 -m http.server 18762 --bind 127.0.0.1 --directory ios/Fixtures

ios-test destination='platform=iOS Simulator,name=iPhone 17': ios-project
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -project ios/OneSixtyTwo.xcodeproj -scheme OneSixtyTwo -destination '{{destination}}' -derivedDataPath ios/build -parallel-testing-enabled NO test CODE_SIGNING_ALLOWED=NO

# Read-only live-site navigation and device-local draft smoke, not a deployment.
ios-live-smoke destination='platform=iOS Simulator,name=iPhone 17': ios-project
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -project ios/OneSixtyTwo.xcodeproj -scheme OneSixtyTwoLive -destination '{{destination}}' -derivedDataPath ios/build -parallel-testing-enabled NO test CODE_SIGNING_ALLOWED=NO

# Archives with the version and build in ios/project.yml and uploads it to App Store Connect for TestFlight.
# Uses the Xcode account's automatic signing; bump CURRENT_PROJECT_VERSION before each upload.
ios-testflight: ios-project
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -project ios/OneSixtyTwo.xcodeproj -scheme OneSixtyTwo -configuration Release -destination 'generic/platform=iOS' -archivePath ios/build/OneSixtyTwo.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM=22DBQNXMQ9 archive
    DEVELOPER_DIR="{{ios_developer_dir}}" xcodebuild -exportArchive -archivePath ios/build/OneSixtyTwo.xcarchive -exportOptionsPlist ios/ExportOptions.plist -exportPath ios/build/export -allowProvisioningUpdates

# Pass a booted simulator UDID; does not open Simulator.app or take focus.
ios-run device: ios-build
    DEVELOPER_DIR="{{ios_developer_dir}}" xcrun simctl install '{{device}}' ios/build/Build/Products/Debug-iphonesimulator/OneSixtyTwo.app
    DEVELOPER_DIR="{{ios_developer_dir}}" xcrun simctl launch '{{device}}' dev.162-0.ios
