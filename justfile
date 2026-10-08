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

smoke *args:
    npm run smoke -- {{args}}

calibrate *args:
    npm run calibrate -- {{args}}

deploy:
    npm run build
    npx wrangler deploy
