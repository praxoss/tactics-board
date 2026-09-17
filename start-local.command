#!/bin/zsh
set -e

cd -- "$(dirname -- "$0")"
RUGBY_PORT="${1:-8000}"

echo "Rugby Tactics Board running at http://localhost:${RUGBY_PORT}"
echo "Press Ctrl+C to stop."
npm run build >/tmp/implaqubles-tactics-board-build.log
python3 -m http.server "$RUGBY_PORT" --directory dist
