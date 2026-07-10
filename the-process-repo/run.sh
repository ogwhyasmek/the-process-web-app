#!/bin/sh
# Start The Process (proxy + app) using the Node runtime bundled in .tools/.
# Usage: ./run.sh   then open http://localhost:4610
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"
exec npm run dev
