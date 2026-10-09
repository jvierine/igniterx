#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Run on juha.no, directly against the public deployment. No dev server.
npm run build
node --test scripts/wasm.test.mjs
install -d /var/www/html/igniterx
rsync -a --exclude=index.html dist/ /var/www/html/igniterx/
install -m 644 dist/index.html /var/www/html/igniterx/index.html
curl --fail --silent --show-error --output /dev/null https://juha.no/igniterx/
