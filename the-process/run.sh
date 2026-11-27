#!/bin/sh
# Start The Process (proxy + app). Usage: ./run.sh   then open http://localhost:4610
# Uses the optional bundled Node runtime in .tools/node if present,
# otherwise the system's Node (20+).
cd "$(dirname "$0")"
if [ -x "$PWD/.tools/node/bin/node" ]; then
  export PATH="$PWD/.tools/node/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20+ is required — install it from https://nodejs.org and re-run." >&2
  exit 1
fi
exec npm run dev
