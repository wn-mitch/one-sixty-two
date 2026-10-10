dev *args:
    npm run dev -- {{args}}

test:
    npm test

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

smoke *args:
    npm run smoke -- {{args}}

calibrate *args:
    npm run calibrate -- {{args}}

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
