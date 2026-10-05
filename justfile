dev *args:
    npm run dev -- {{args}}

test:
    npm test

smoke *args:
    npm run smoke -- {{args}}

calibrate *args:
    npm run calibrate -- {{args}}

deploy:
    npm run build
    npx wrangler deploy
