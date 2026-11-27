#!/bin/sh
# One-time setup: installs dependencies for the root, server, and client.
# Uses the optional bundled Node runtime in .tools/node if present,
# otherwise the system's Node (18+).
cd "$(dirname "$0")"
if [ -x "$PWD/.tools/node/bin/node" ]; then
  export PATH="$PWD/.tools/node/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 18+ is required — install it from https://nodejs.org and re-run." >&2
  exit 1
fi
npm install --no-fund --no-audit && npm run setup || exit 1
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo
  echo "Created server/.env from the example — open it and paste your FINNHUB_API_KEY."
fi
echo
echo "Setup complete. Start the app with ./run.sh"
