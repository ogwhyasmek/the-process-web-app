#!/bin/sh
# One-time setup: installs dependencies for the root, server, and client
# using the Node runtime bundled in .tools/.
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"
npm install --no-fund --no-audit && npm run setup
echo
echo "Setup complete. Next: cp server/.env.example server/.env and add your"
echo "FINNHUB_API_KEY, then start the app with ./run.sh"
